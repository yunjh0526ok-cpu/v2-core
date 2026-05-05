/**
 * POST /api/legal-guide/enrich
 * Legal-Guide 페이지·외부 클라이언트용 — 포괄 법령·판례 fallback 블록만 JSON 반환.
 * (메인 분석은 /api/law/analyze 가 담당)
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { runComprehensiveLegalEnrichmentFallback } from "@/lib/comprehensiveLegalEnrichment";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(2).max(2000),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const out = await runComprehensiveLegalEnrichmentFallback(parsed.data.prompt);
    return NextResponse.json({
      ok: true,
      data: {
        systemBlock: out.systemBlock,
        context: out.context,
      },
    });
  } catch (e) {
    console.warn("[api/legal-guide/enrich]", (e as Error).message);
    return NextResponse.json({
      ok: true,
      data: {
        systemBlock: "",
        context: {
          riskScore: 22,
          riskLevel: "LOW" as const,
          citations: [],
        },
      },
    });
  }
}
