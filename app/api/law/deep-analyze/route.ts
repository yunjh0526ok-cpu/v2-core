/**
 *  POST /api/law/deep-analyze
 *  ─────────────────────────────────────────────────────────────────────
 *   Legal-Guide '심층 진단 모드' 전용 엔드포인트.
 *   · 구조화 컨텍스트(직무·관계·반복성·증거·현재단계)를 받아서
 *   · 규칙 엔진 + 법령 API 조문 + Gemini 로 다각도 분석
 *   · 예상 처분 분포 + 증거 체크리스트 + 공익신고자 보호 플레이북 + 보복 방어책
 *     을 DefenseBrief 로 반환.
 *
 *   저장은 옵션(persist=true). 기본 true 로 Hub 에도 집계됨.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeRisk,
  fetchLawDetail,
  searchLawsWithKeywordFallback,
  type LawArticle,
} from "@/lib/law-api";
import { runComprehensiveLegalEnrichmentFallback } from "@/lib/comprehensiveLegalEnrichment";
import { deepDiagnose, enhanceRiskWithGemini } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({
  situation: z.string().min(10, "상황을 10자 이상 입력해 주세요.").max(4000),
  role: z.string().max(50).optional(),
  relation: z.string().max(50).optional(),
  frequency: z.enum(["once", "repeat", "unknown"]).optional(),
  evidence: z.array(z.string().max(80)).max(20).optional(),
  currentStage: z
    .enum(["before", "internal-audit", "investigation", "disciplinary", "post"])
    .optional(),
  reported: z.boolean().optional(),
  mode: z.enum(["defense", "active-admin"]).optional().default("defense"),
  department: z.string().max(100).optional(),
  persist: z.boolean().optional().default(true),
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
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const {
    situation,
    role,
    relation,
    frequency,
    evidence,
    currentStage,
    reported,
    mode,
    department,
    persist,
  } = parsed.data;

  const started = Date.now();

  // 1) 규칙 엔진 1차
  let base = await analyzeRisk(situation);

  // 2) 조문 컨텍스트 수집
  let articles: LawArticle[] = [];
  if (base.relatedLaws.length > 0) {
    try {
      const top = base.relatedLaws[0];
      const detail = await fetchLawDetail(top.mst ?? top.id, top.name);
      articles = detail.articles.slice(0, 4);
    } catch {
      /* noop */
    }
  } else {
    try {
      const s = await searchLawsWithKeywordFallback(situation);
      if (s.items[0]) {
        const d = await fetchLawDetail(s.items[0].mst ?? s.items[0].id, s.items[0].name);
        articles = d.articles.slice(0, 4);
      }
    } catch {
      /* noop */
    }
  }

  if (articles.length === 0) {
    try {
      const fb = await runComprehensiveLegalEnrichmentFallback(situation);
      if (fb.context.citations.length > 0) {
        base = {
          ...base,
          citations: [
            ...base.citations,
            ...fb.context.citations.map((c) => ({
              statute: c.statute,
              clause: c.clause,
              excerpt: c.excerpt,
            })),
          ].slice(0, 15),
        };
      }
    } catch {
      /* noop */
    }
  }

  // 3) 기본 Gemini 강화 분석 (narrative/keyIssues)
  const enhanced = await enhanceRiskWithGemini(base, articles);

  // 4) 심층 Defense Brief
  const brief = await deepDiagnose(
    {
      situation,
      role,
      relation,
      frequency,
      evidence,
      currentStage,
      reported,
      mode,
    },
    base,
    articles
  );

  // 5) 저장 (Hub 반영)
  let consultationId: string | undefined;
  if (persist) {
    try {
      const saved = await prisma.consultation.create({
        data: {
          prompt: situation,
          scenario:
            mode === "active-admin" ? "active-admin" : "deep-defense",
          riskScore: enhanced.riskScore,
          riskLevel: enhanced.riskLevel,
          summary: enhanced.summary,
          narrative: enhanced.narrative,
          citations: JSON.stringify(enhanced.citations),
          recommendations: JSON.stringify(enhanced.recommendations),
          keyIssues: JSON.stringify(enhanced.keyIssues),
          factors: JSON.stringify(enhanced.factors),
          relatedLaws: JSON.stringify(enhanced.relatedLaws),
          engine: enhanced.engine,
          confidence: enhanced.confidence,
          department: department ?? null,
          userTag: `mode=${mode}`,
        },
      });
      consultationId = saved.id;
    } catch (e) {
      console.warn("[deep-analyze] persist failed:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    data: {
      analysis: { ...enhanced, consultationId },
      defense: brief,
    },
    meta: {
      elapsedMs: Date.now() - started,
      mode,
      engine: {
        analysis: enhanced.engine,
        defense: brief.engine,
      },
    },
  });
}
