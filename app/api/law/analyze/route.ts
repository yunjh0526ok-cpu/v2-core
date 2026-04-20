import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeRisk,
  fetchLawDetail,
  searchLaws,
  type LawArticle,
} from "@/lib/law-api";
import { enhanceRiskWithGemini } from "@/lib/gemini";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(2, "최소 2자 이상 입력해주세요").max(2000),
  department: z.string().max(100).optional(),
  userTag: z.string().max(60).optional(),
  /** 저장 비활성화 옵션 (예: 테스트) */
  persist: z.boolean().optional().default(true),
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

  const { prompt, department, userTag, persist } = parsed.data;

  //  ── (1) 규칙 엔진 1차 분석 ───────────────────────────────────────
  const baseAnalysis = await analyzeRisk(prompt);

  //  ── (2) 관련 조문 원문 수집 (Gemini 컨텍스트용) ─────────────────
  let articles: LawArticle[] = [];
  if (baseAnalysis.relatedLaws.length > 0) {
    try {
      const top = baseAnalysis.relatedLaws[0];
      const detail = await fetchLawDetail(top.mst ?? top.id, top.name);
      articles = detail.articles;

      // 이해충돌 등 2차 법령까지 같이 가져오기 (베스트 에포트)
      if (baseAnalysis.relatedLaws.length > 1) {
        const second = baseAnalysis.relatedLaws[1];
        const d2 = await fetchLawDetail(second.mst ?? second.id, second.name);
        articles = [...articles, ...d2.articles].slice(0, 8);
      }
    } catch (e) {
      console.warn("[api/law/analyze] article fetch failed:", (e as Error).message);
    }
  } else {
    // relatedLaws 비어 있으면 한번 더 검색해서라도 컨텍스트 확보
    try {
      const s = await searchLaws(prompt.slice(0, 40));
      if (s.items[0]) {
        const d = await fetchLawDetail(s.items[0].mst ?? s.items[0].id, s.items[0].name);
        articles = d.articles;
      }
    } catch {
      /* noop */
    }
  }

  //  ── (3) Gemini 강화 (실패 시 rules-only 유지) ───────────────────
  const enhanced = await enhanceRiskWithGemini(baseAnalysis, articles);

  //  ── (4) DB 에 상담 기록 저장 → Hub 대시보드 데이터 소스 ────────
  let consultationId: string | undefined;
  if (persist) {
    try {
      const saved = await prisma.consultation.create({
        data: {
          prompt: enhanced.prompt,
          scenario: inferScenarioTag(enhanced),
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
          userTag: userTag ?? null,
        },
      });
      consultationId = saved.id;
    } catch (e) {
      console.warn("[api/law/analyze] persist failed:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    data: { ...enhanced, consultationId },
  });
}

/** Gemini + rules 응답에서 Hub 통계용 시나리오 태그 뽑기 */
function inferScenarioTag(a: { factors: Array<{ label: string }> }): string {
  const baseline = a.factors.find((f) =>
    f.label.startsWith("시나리오 베이스라인")
  );
  const m = baseline?.label.match(/\(([^)]+)\)/);
  return m?.[1] ?? "generic";
}
