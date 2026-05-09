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
  /** 브라우저에서 직접 law.go.kr 호출한 판례 결과 — 서버 IP 우회용 */
  clientPrecedents: z
    .array(
      z.object({
        caseNo: z.string().max(100),
        court: z.string().max(60),
        date: z.string().max(30),
        gist: z.string().max(300),
        outcome: z.enum(["승소", "패소"]),
        outcomeKeyword: z.string().max(60),
      })
    )
    .max(10)
    .optional(),
});

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s/gm, "")
    .replace(/^[\*\-]\s/gm, "")
    .trim();
}

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

  const { prompt, department, userTag, persist, clientPrecedents } = parsed.data;

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
  // clientPrecedents 제공 시 서버측 law.go.kr 판례 검색 스킵 (브라우저 IP 우회)
  const precedents = clientPrecedents && clientPrecedents.length > 0
    ? clientPrecedents
    : await searchRelevantPrecedents(prompt);
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
      "질문 의도를 먼저 파악하고 핵심만 간결하게 답변합니다.",
      "마크다운 기호(**, *, ##, -, •)를 절대 출력하지 마세요.",
      "일반 법률 질문에서 공직자 전용 문구(소속기관 행동강령, 청렴옴부즈만 등)를 절대 출력하지 마세요.",
      "핵심 쟁점 섹션과 권고 조치 섹션은 출력 금지입니다.",
      "판례 문장은 중간에서 자르지 말고 완성된 문장으로 출력하세요.",
      "",
      "[출력 구조 — 반드시 이 순서, 이 형식만]",
      "▶ 핵심 답변",
      "질문에 대한 직접 답변 2~3줄. 마크다운 기호 절대 사용 금지.",
      "",
      "▶ 예상 시나리오 (3가지)",
      "각 시나리오별로 아래 항목 포함:",
      "- 시나리오명: (예: 고의·중과실이 명백한 경우)",
      "- 인정되는 경우: 구체적 행위 예시 2~3가지",
      "  (예: 무단 공사 중단, 허위 보고서 제출 등)",
      "- 인정되지 않는 경우: 구체적 반례 1~2가지",
      "- 관련 판례: 이 시나리오에 해당하는 실제 판례 사건번호 + 요지 1줄",
      "마크다운 기호 절대 사용 금지. 번호와 줄바꿈으로만 구분할 것.",
      "",
      "▶ 실행 로드맵",
      "3줄 이내. 핵심만. 날짜/기관명 포함.",
      "예시:",
      "첫날: 관련 증거 확보 + 내용증명 발송",
      "1주일: 관할 법원 또는 노동위원회 상담",
      "1개월: 소장 접수 또는 조정 신청",
      "",
      "▶ 변호사 조언",
      "실수 TOP 2 + 법정 기한 경고 2~3줄.",
      "",
      "▶ 리스크",
      "% + LOW/MED/HIGH",
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
      "6) 핵심 쟁점/권고 조치 섹션은 절대 출력하지 말 것.",
      "7) 공직자 전용 문구(소속기관 행동강령, 청렴옴부즈만 등) 금지.",
      "8) 판례 요지는 문장 중간에 자르지 말고 완결 문장으로 쓸 것.",
      "9) 위 형식 외 다른 섹션/문구를 쓰지 말 것.",
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
      narrative: stripMarkdown(txt),
      keyIssues: [],       // 일반 법률 질문: 핵심쟁점 섹션 미출력
      recommendations: [], // 일반 법률 질문: 권고조치 섹션 미출력 (공직자 전용 문구 제거)
      citations: [],       // 일반 법률 질문: 법령근거 섹션 미출력 (narrative에 포함)
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
