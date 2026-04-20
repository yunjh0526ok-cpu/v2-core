import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE_SEC,
  issueSessionToken,
  verifyPassword,
} from "@/lib/admin-auth";

export const runtime = "nodejs";

const BodySchema = z.object({
  password: z.string().min(1).max(200),
});

// 동일 IP 에서 무차별 대입을 지연시키는 간단한 in-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

function bucket(ip: string) {
  const now = Date.now();
  const cur = attempts.get(ip);
  if (!cur || cur.resetAt < now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, fresh);
    return fresh;
  }
  return cur;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  const b = bucket(ip);
  if (b.count >= LIMIT) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: "시도 횟수 초과. 10분 뒤 다시 시도해주세요.",
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION" }, { status: 400 });
  }

  const ok = verifyPassword(parsed.data.password);
  if (!ok) {
    b.count += 1;
    // 항상 조금 지연시켜서 timing 공격 완화
    await new Promise((r) => setTimeout(r, 250));
    return NextResponse.json(
      {
        ok: false,
        error: "INVALID_CREDENTIALS",
        attempt: b.count,
        remaining: Math.max(0, LIMIT - b.count),
      },
      { status: 401 }
    );
  }

  // 성공 — 카운터 리셋
  attempts.delete(ip);

  const token = await issueSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE_SEC,
  });
  return res;
}
