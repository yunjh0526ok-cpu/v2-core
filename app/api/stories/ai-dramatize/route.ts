/**
 *  POST /api/stories/ai-dramatize
 *  ─────────────────────────────────────────────────────────────────────
 *   관리자가 강사의 '원천 판례 사실(facts)'을 입력하면, Gemini Pro 가
 *   숏폼 드라마 3막 구조 + Dilemma Quiz 로 각색해서 반환합니다.
 *
 *   · 인증: middleware.ts 에서 ADMIN 쿠키 검증됨 (/api/stories/* 보호)
 *   · 실패(키 없음/쿼터) 시: 폴백 템플릿 반환 (engine=rules)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { dramatizeCase } from "@/lib/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  facts: z
    .string()
    .trim()
    .min(20, "사실 관계는 최소 20자 이상 입력해 주세요.")
    .max(4000),
  category: z.string().max(40).optional(),
  lawHints: z
    .array(
      z.object({
        statute: z.string().min(1).max(80),
        clause: z.string().max(120).optional(),
      })
    )
    .max(8)
    .optional(),
  realOutcome: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
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

  try {
    const started = Date.now();
    const drama = await dramatizeCase(parsed.data);
    const elapsedMs = Date.now() - started;
    return NextResponse.json({
      ok: true,
      data: drama,
      meta: {
        engine: drama.engine,
        elapsedMs,
      },
    });
  } catch (err) {
    console.error("[api/stories/ai-dramatize] error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "DRAMATIZE_FAILED",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
