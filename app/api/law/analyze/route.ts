import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeRisk,
  fetchLawDetail,
  searchRelevantPrecedents,
  searchLawsWithKeywordFallback,
  type LawArticle,
  type RelevantPrecedent,
} from "@/lib/law-api";
import { runComprehensiveLegalEnrichmentFallback } from "@/lib/comprehensiveLegalEnrichment";
import {
  callText,
  enhanceRiskWithGemini,
  type EnhancedRiskAnalysis,
} from "@/lib/gemini";
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
  let baseAnalysis = await analyzeRisk(prompt);

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
      const s = await searchLawsWithKeywordFallback(prompt);
      if (s.items[0]) {
        const d = await fetchLawDetail(s.items[0].mst ?? s.items[0].id, s.items[0].name);
        articles = d.articles;
      }
    } catch {
      /* noop */
    }
  }

  //  ── (2-b) 조문이 비었을 때 포괄 fallback — 법령·판례 enrichment 인용만 병합
  if (articles.length === 0) {
    try {
      const fb = await runComprehensiveLegalEnrichmentFallback(prompt);
      if (fb.context.citations.length > 0) {
        baseAnalysis = {
          ...baseAnalysis,
          citations: [
            ...baseAnalysis.citations,
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

  //  ── (2-c) 추가 fallback: 기존 분기에서 놓친 일반 법률 질의까지 보강
  //      (기존 분기 유지, citations 이 비었을 때만 1회 더 시도)
  if (baseAnalysis.citations.length === 0) {
    try {
      const fb = await runComprehensiveLegalEnrichmentFallback(prompt);
      if (fb.context.citations.length > 0) {
        baseAnalysis = {
          ...baseAnalysis,
          citations: fb.context.citations.map((c) => ({
            statute: c.statute,
            clause: c.clause,
            excerpt: c.excerpt,
          })),
        };
      }
    } catch {
      /* noop */
    }
  }

  //  ── (3) Gemini 강화 (실패 시 rules-only 유지) ───────────────────
  const precedents = await searchRelevantPrecedents(prompt);
  const publicEthicsQuery = isPublicEthicsQuery(prompt);
  const enhanced = publicEthicsQuery
    ? await enhanceRiskWithGemini(baseAnalysis, articles)
    : await enhanceGeneralLegalWithGemini(baseAnalysis, articles, precedents);

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
    data: {
      ...enhanced,
      consultationId,
      enrichment:
        baseAnalysis.citations.length > 0 ? "legacy-or-fallback" : "none",
    },
  });
}

function isPublicEthicsQuery(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /공직|공무원|청렴|윤리|청탁|이해충돌|복무|징계|적극행정|소극행정|권익위|감사/i.test(
      t
    ) || /김영란|행동강령|부패|공익신고/i.test(t)
  );
}

async function enhanceGeneralLegalWithGemini(
  base: {
    prompt: string;
    riskScore: number;
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    summary: string;
    factors: Array<{ label: string; delta: number; detail: string }>;
    citations: Array<{ statute: string; clause: string; excerpt?: string }>;
    recommendations: string[];
    relatedLaws: Array<{
      id: string;
      name: string;
      abbr?: string;
      department?: string;
      effectiveDate?: string;
      status?: string;
    }>;
    articlesUsed: Array<{ law: string; article: string; excerpt: string }>;
    mocked: boolean;
    source: string;
  },
  relatedArticles: LawArticle[],
  precedents: RelevantPrecedent[] = []
): Promise<EnhancedRiskAnalysis> {
  try {
    const citationLines = base.citations
      .map(
        (c) =>
          `- ${c.statute} ${c.clause}${c.excerpt ? ` — ${c.excerpt.slice(0, 160)}` : ""}`
      )
      .join("\n");
    const articleLines = relatedArticles
      .slice(0, 4)
      .map(
        (a) =>
          `- 제${a.no}${a.sub ? "의" + a.sub : ""}조 ${a.title}: ${a.content
            .replace(/\s+/g, " ")
            .slice(0, 280)}`
      )
      .join("\n");
    const won = precedents.filter((p) => p.outcome === "승소").slice(0, 2);
    const lost = precedents.filter((p) => p.outcome === "패소").slice(0, 2);
    const precedentLines =
      precedents.length > 0
        ? [
            "▶ 관련 판례:",
            ...won.map(
              (p) =>
                `[승소 사례] ${p.caseNo} | ${p.court} | ${p.date}\n→ 핵심 요지: ${p.gist}\n→ 승소 근거: ${p.outcomeKeyword}`
            ),
            ...lost.map(
              (p) =>
                `[패소 사례] ${p.caseNo} | ${p.court} | ${p.date}\n→ 핵심 요지: ${p.gist}\n→ 패소 원인: ${p.outcomeKeyword}`
            ),
            `→ 내 상황과의 유사도: ${precedents.length >= 3 ? "높음" : precedents.length === 2 ? "중간" : "낮음"} + 질문 키워드와 사건 쟁점 매칭 기반`,
          ].join("\n")
        : "관련 판례를 찾지 못했습니다. 대법원 종합법률정보(glaw.scourt.go.kr)에서 직접 검색하시기 바랍니다.";

    const system = [
      "당신은 대한민국 최고 수준의 법률 AI 전문가입니다.",
      "사용자가 한 번의 질문으로 완전한 해결책을 얻을 수 있도록",
      "질문 의도 분석 → 예상 상황 추론 → 단계별 해결책 → 리스크 예측까지",
      "한 번에 제공합니다.",
      "",
      "[Step 1 - 질문 의도 분류]",
      "질문을 받으면 먼저 아래 유형으로 분류하고 그에 맞게 답변:",
      '- "방법/절차/어떻게" → 1단계~N단계 실행 순서를 구체적으로 제시',
      '- "기간/언제/얼마나" → 법정 기한을 숫자로 먼저, 예외 조건 포함',
      '- "가능한가/되나요" → 가능 조건 + 불가 조건 동시 제시',
      '- "얼마/금액/배상" → 계산 공식 + 실제 사례 기준 금액 범위 제시',
      '- "신고/고소/고발" → 기관명 + 접수 방법 + 처리 절차 순서대로',
      '- "증거/입증" → 필요 증거 목록 + 수집 방법 + 보존 주의사항',
      "",
      "[Step 2 - 예상 상황 추론]",
      "사용자가 말하지 않은 부분까지 추론해서 선제적으로 답변:",
      "- 이 질문을 하는 사람이 처한 전형적인 상황 2~3가지를 예측",
      "- 각 상황별로 달라지는 법적 판단과 대응 방법을 함께 제시",
      '- "만약 ~라면" 형식으로 분기별 시나리오 제공',
      "",
      "[Step 3 - 실행 가능한 단계별 해결책]",
      "추상적 설명 금지. 오늘 당장 실행할 수 있는 수준으로:",
      "- 1단계: 즉시 해야 할 것 (오늘)",
      "- 2단계: 단기 조치 (1주일 이내)",
      "- 3단계: 중장기 절차 (1개월 이내)",
      "기관명, 접수처, 서류명, 법정 기한을 구체적으로 명시",
      "",
      "[Step 4 - 리스크 예측 및 경고]",
      "- 이 상황에서 가장 많이 실수하는 것 TOP 3",
      "- 놓치면 안 되는 법정 기한 (날짜/일수로 명시)",
      "- 불리해지는 행동 패턴 경고",
      "",
      "[응답 출력 형식 - 반드시 이 순서]",
      "▶ 핵심 답변: 질문 유형에 맞는 직접 답변 (방법이면 단계, 기간이면 숫자)",
      "▶ 예상 시나리오: 상황별 분기 답변 (2~3가지)",
      "▶ 실행 로드맵: 오늘/1주일/1개월 단계별 행동",
      "▶ 근거 법령: 조문명 + 조항번호 + 핵심 내용 한 줄 요약",
      "▶ 관련 판례:",
      "  [승소 사례] 사건번호 | 법원 | 판결일",
      "  → 핵심 요지: (한 줄)",
      "  → 승소 근거: (핵심 포인트)",
      "  [패소 사례] 사건번호 | 법원 | 판결일",
      "  → 핵심 요지: (한 줄)",
      "  → 패소 원인: (핵심 포인트)",
      "  → 내 상황과의 유사도: (높음/중간/낮음 + 이유 한 줄)",
      "▶ 변호사 조언: 실수 TOP3 + 법정 기한 경고",
      "▶ 리스크: % + LOW/MED/HIGH + 판단 근거 한 줄",
      "",
      "[절대 금지 사항]",
      '- "~할 수 있습니다" 로만 끝나는 뻔한 답변',
      "- 질문자가 이미 아는 사실 반복",
      "- 일반론적 설명으로 때우기",
      "- 횡설수설, 두루뭉술한 표현",
      '- "전문가와 상담하세요" 만 달랑 쓰는 것',
      "  (상담 권유는 변호사 조언 마지막 줄에 한 번만)",
    ].join("\n");

    const user = [
      `질문: ${base.prompt}`,
      "",
      `기본 리스크 판단: ${base.riskScore}% (${base.riskLevel})`,
      "",
      "[법령·판례 근거]",
      citationLines || "(없음)",
      "",
      "[조문 원문 발췌]",
      articleLines || "(없음)",
      "",
      "[관련 판례]",
      precedentLines,
      "",
      "요구사항:",
      "1) '핵심 답변:'은 질문에 대한 직접 답변 1~2문장.",
      "2) '근거 법령:'은 법령명 + 조항번호를 명시.",
      "3) '관련 판례:'는 승소/패소 각각 최대 2건을 형식대로 출력. 판례가 없으면 안내문 그대로 출력.",
      "4) '변호사 조언:'은 실무 주의사항 2~3줄.",
      "5) '리스크:'는 퍼센트와 LOW/MED/HIGH 포함.",
      "6) 위 형식 외 다른 섹션/문구를 쓰지 말 것.",
    ].join("\n");

    const txt = await callText({
      system,
      messages: [{ role: "user", content: user }],
      temperature: 0.25,
      maxOutputTokens: 1400,
    });

    if (!txt) {
      return await enhanceRiskWithGemini(base, relatedArticles);
    }

    const followUps = [
      "사실관계(계약서/증거/시점)를 더 구체화해 주실 수 있나요?",
      "상대방과 주고받은 문서/메시지 중 핵심 문구를 알려주실 수 있나요?",
    ];

    return {
      ...base,
      narrative: txt,
      keyIssues:
        base.citations.slice(0, 3).map((c) => `${c.statute} ${c.clause}`) || [],
      followUpQuestions: followUps,
      engine: "gemini+rules",
      confidence: "medium",
    };
  } catch {
    return await enhanceRiskWithGemini(base, relatedArticles);
  }
}

/** Gemini + rules 응답에서 Hub 통계용 시나리오 태그 뽑기 */
function inferScenarioTag(a: { factors: Array<{ label: string }> }): string {
  const baseline = a.factors.find((f) =>
    f.label.startsWith("시나리오 베이스라인")
  );
  const m = baseline?.label.match(/\(([^)]+)\)/);
  return m?.[1] ?? "generic";
}
