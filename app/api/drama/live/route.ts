/**
 *  POST /api/drama/live
 *  ─────────────────────────────────────────────────────────────────────
 *   공개 엔드포인트. 키워드(질문) 한 줄을 받아 즉석에서 3막 드라마를 생성.
 *   - DB 저장 없음 (관리자 저장은 /api/stories/ai-dramatize)
 *   - 간단한 IP 기반 rate limit (분당 6회)
 *   - Gemini 실패 시 규칙 기반 폴백
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { dramatizeCase, buildFallbackDrama } from "@/lib/gemini";
import { adaptDramatizeToLivePayload } from "@/lib/liveDramaPayload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Simple in-memory rate limiter (분당 6회) ─────────────────── */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const LIMIT = 6;
const WINDOW_MS = 60_000;

function getIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}
function checkLimit(ip: string): { ok: boolean; remaining: number; resetIn: number } {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: LIMIT - 1, resetIn: WINDOW_MS };
  }
  b.count++;
  return {
    ok: b.count <= LIMIT,
    remaining: Math.max(0, LIMIT - b.count),
    resetIn: b.resetAt - now,
  };
}

const BodySchema = z.object({
  keyword: z
    .string()
    .trim()
    .min(2, "키워드는 최소 2자 이상 입력해 주세요.")
    .max(200),
  category: z.string().max(40).optional(),
});

/**
 *  키워드를 받으면 "상황 facts" 형식으로 확장해서 dramatizeCase 에 넘긴다.
 *  (dramatizeCase 는 facts >= 20자 검증이 있으므로 확장 필수)
 */
function expandKeywordToFacts(keyword: string, category?: string): string {
  const cat = category ?? "";
  const kw = keyword.trim();
  return [
    `공직자 상황 키워드: "${kw}"${cat ? ` (분류: ${cat})` : ""}`,
    "",
    "위 키워드와 관련해 공직자 업무 현장에서 실제로 반복 발생하는 대표 시나리오를",
    "실명·실제 기관명을 익명화하여 3막 드라마로 각색해 주세요.",
    "국가법령과 실제 판례·처분 사례에 부합하는 내용이어야 합니다.",
  ].join("\n");
}

export async function POST(req: Request) {
  const ip = getIp(req);
  const rl = checkLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: `잠시만 기다려 주세요. 분당 ${LIMIT}회까지 생성 가능합니다.`,
        resetInMs: rl.resetIn,
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.issues,
      },
      { status: 400 }
    );
  }

  const { keyword, category } = parsed.data;
  const facts = expandKeywordToFacts(keyword, category);

  const started = Date.now();
  let degraded = false;
  let raw = await dramatizeCase({ facts, category }).catch((err) => {
    console.error("[api/drama/live] dramatizeCase failed:", err);
    degraded = true;
    return buildFallbackDrama({ facts, category });
  });

  try {
    const data = adaptDramatizeToLivePayload(raw, { keyword, category });
    return NextResponse.json({
      ok: true,
      data,
      meta: {
        engine: data.engine,
        elapsedMs: Date.now() - started,
        remaining: rl.remaining,
        degraded,
      },
    });
  } catch (err) {
    console.error("[api/drama/live] adapt/serialize error:", err);
    raw = buildFallbackDrama({ facts, category });
    const data = adaptDramatizeToLivePayload(raw, { keyword, category });
    return NextResponse.json({
      ok: true,
      data,
      meta: {
        engine: "fallback",
        elapsedMs: Date.now() - started,
        remaining: rl.remaining,
        degraded: true,
      },
    });
  }
}
