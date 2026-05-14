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
  /** 연속 대화 히스토리 (클라이언트에서 누적 전송) */
  history: z
    .array(
      z.object({
        role: z.enum(["user", "model"]),
        content: z.string().max(2000),
      })
    )
    .max(20)
    .optional()
    .default([]),
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

  const { prompt, department, userTag, persist, clientPrecedents, history } = parsed.data;

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
    ? await enhanceRiskWithGemini(baseAnalysis, articles, history)
    : await enhanceGeneralLegalWithGemini(baseAnalysis, articles, precedents, history);

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
  precedents: RelevantPrecedent[] = [],
  history: Array<{ role: "user" | "model"; content: string }> = []
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
      "당신은 대한민국 공직자 청렴 전문 법률 AI 'LexGuard'입니다.",
      "사용자는 항상 공직자 또는 공공기관 종사자입니다.",
      "이전 대화 맥락을 반드시 유지하며, 연속 질문은 앞선 상황의 연장선으로 해석하세요.",
      "마크다운 기호(**, *, ##, -, •) 절대 출력 금지. 추측 금지.",
      "",
      "반드시 아래 5섹션 구조만 사용. 섹션 사이 빈 줄 1개. 다른 섹션 추가 금지.",
      "",
      "[VERDICT]",
      "첫 줄: ✅ 또는 ❌ + 한 줄 판정문 (10자 이내, 직설적으로)",
      "둘째 줄: 리스크 XX% — 적용 법령 조문명",
      "예: ❌ 금품수수에 해당합니다 / 리스크 82% — 청탁금지법 제8조 제1항",
      "",
      "[WHY]",
      "3줄 이내 자연어 설명. 전문용어 최소화. 상황에 직접 대입해서 설명.",
      "",
      "[CASE]",
      "단 1줄: 기관명 / 연도 / 처분결과 / 사건번호(또는 결정번호)",
      "대법원 판례 없으면 국민권익위·감사원·인사혁신처 사례 사용. 절대 생략 금지.",
      "예: 국민권익위 / 2022 / 과태료 200만원 / 권익위 2022-결정-0341",
      "",
      "[ACTION]",
      "① 오늘 — 구체적 행동 + 방법 (어디에, 어떻게)",
      "② 48시간~1주일 내 — 기한 명시",
      "③ 예외 상황 대처 — 반환거부·분실·상급자 압박 등",
      "로드맵·청렴교육·소속기관 문구 같은 추상적 항목 절대 금지.",
      "",
      "[NEXT]",
      "이 상황과 연결된 후속 질문 2개. 이전 대화 맥락 반영. 물음표로 끝낼 것.",
    ].join("\n");

    const historyMessages = history.slice(-6).map((h) => ({
      role: (h.role === "model" ? "assistant" : "user") as "user" | "assistant",
      content: h.content.slice(0, 800),
    }));

    const user = [
      ...(history.length > 0
        ? [
            `## 이전 대화 맥락 (최근 ${Math.min(history.length, 6)}턴)`,
            ...history
              .slice(-6)
              .map(
                (h) =>
                  `[${h.role === "user" ? "이전 질문" : "이전 답변"}]: ${h.content.slice(0, 400)}`
              ),
            `위 대화 맥락을 참고해 현재 질문에 연결된 답변을 하세요.`,
            ``,
          ]
        : []),
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
      "[참고 판례 컨텍스트]",
      precedentLines,
      "",
      "요구사항:",
      "1) [VERDICT] 첫 줄: ✅/❌ + 판정문. 둘째 줄: 리스크 XX% — 법령명.",
      "2) [CASE] 는 기관명/연도/처분결과/사건번호 1줄. 절대 생략 금지.",
      "3) [ACTION] 은 ①②③ 즉시조치. 추상적 항목(청렴교육 등) 절대 금지.",
      "4) [NEXT] 는 이전 맥락과 연결된 질문 2개. 물음표로 끝낼 것.",
      "5) 위 5개 섹션 외 다른 섹션 절대 출력 금지.",
    ].join("\n");

    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...historyMessages,
      { role: "user", content: user },
    ];

    const txt = await callText({
      system,
      messages,
      temperature: 0.25,
      maxOutputTokens: 1400,
    });

    if (!txt) {
      return await enhanceRiskWithGemini(base, relatedArticles, history);
    }

    // [NEXT] 섹션에서 후속 질문 파싱
    const followUpSection = txt.match(/\[NEXT\]([\s\S]*?)$/)?.[1] ?? "";
    const parsedFollowUps = followUpSection
      .split(/\n/)
      .map((l) => l.trim().replace(/^[0-9]+[.)]\s*/, "").replace(/^[-•]\s*/, ""))
      .filter((l) => l.length > 4)
      .slice(0, 3);
    const followUps =
      parsedFollowUps.length > 0
        ? parsedFollowUps
        : [
            "이 상황에서 추가로 주의해야 할 점이 있을까요?",
            "비슷한 상황에서 다른 공직자들은 어떻게 처리했나요?",
          ];

    return {
      ...base,
      narrative: stripMarkdown(txt),
      keyIssues: [],
      recommendations: [],
      citations: [],
      followUpQuestions: followUps,
      engine: "gemini+rules",
      confidence: "medium",
    };
  } catch {
    return await enhanceRiskWithGemini(base, relatedArticles, history);
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
