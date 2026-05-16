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
  /** 기관·직위 맞춤 설정 */
  userContext: z
    .object({
      orgType: z.string().max(50),
      position: z.string().max(30),
    })
    .optional(),
});

/**
 * 2024년 1월 1일 개정 청탁금지법 수치 — 학습 데이터보다 이 값을 우선 적용
 */
const ANTI_GRAFT_LAW_AMOUNTS = [
  "[필수 적용 법령 수치 — 2024년 1월 1일 개정 기준]",
  "청탁금지법 음식물 상한: 5만원 (구 3만원 → 개정)",
  "청탁금지법 선물 상한: 5만원",
  "청탁금지법 농수산물·가공품: 15만원 / 명절(설·추석): 30만원",
  "경조사비: 5만원",
  "화환·조화: 10만원",
  "위 수치와 다른 내용이 학습 데이터에 있어도 반드시 위 수치를 우선 적용할 것.",
  "",
].join("\n");

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

  const { prompt, department, userTag, persist, clientPrecedents, history, userContext } = parsed.data;

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
    : await enhanceGeneralLegalWithGemini(baseAnalysis, articles, precedents, history, userContext);

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
  history: Array<{ role: "user" | "model"; content: string }> = [],
  userContext?: { orgType: string; position: string }
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

    const userCtxLine = userContext
      ? `[사용자 정보] ${userContext.orgType} 소속 · ${userContext.position}. 이 맥락에 맞는 법령·처벌 수위·판례를 우선 적용할 것. (공기업·공공기관 임원→공공기관운영법 추가, 광역시도·지자체→지방공무원법 우선, 교육기관·교육청→교육공무원법 추가 검토, 군·경찰·소방→군인사법·경찰공무원법 적용)`
      : `[사용자 정보] 공공기관 일반 공직자 (기관·직위 미설정 — 국가공무원법 기준 적용).`;

    const system = [
      ANTI_GRAFT_LAW_AMOUNTS,
      "당신은 대한민국 공직자 청렴 전문 법률 AI 'LexGuard'입니다.",
      userCtxLine,
      "이전 대화 맥락을 반드시 유지하며, 연속 질문은 앞선 상황의 연장선으로 해석하세요.",
      "마크다운 기호(**, *, ##, -, •) 절대 출력 금지. 추측 금지.",
      "'판례 없음', '찾지 못했습니다', '직접 검색하세요', '검색 결과가 없습니다' 절대 출력 금지.",
      "",
      "▶ 질문 유형 자동 분류:",
      "· 리스크 판정(~해도 되나요, ~위법인가요, ~괜찮나요, ~받아도 되나요): [VERDICT][WHY][CASE][ACTION][NEXT]",
      "· 판례·정보 요청(판례, 판결문, 사례, 처벌이 어떻게, 분석, 요약, 자세히, 상세히, 어떤 처벌, 어떻게 되나요): [CASES][INTERP] — 절대 [VERDICT] 포맷 사용 금지",
      "· 신고·후속행동(신고하면, 어떻게 하나요, 거부하면, 불이익): [GUIDE]",
      "",
      "══ 유형A: [VERDICT][WHY][CASE][ACTION][NEXT] ══",
      "",
      "[VERDICT]",
      "첫 줄: ✅ 또는 ❌ + 한 줄 판정문 (10자 이내, 직설적으로)",
      "둘째 줄: 리스크 XX% — 법령명 §조항: 의무/요건/기한 1줄 설명",
      "예: ❌ 금품수수에 해당합니다",
      "    리스크 82% — 청탁금지법 §8①: 직무관련자 금품 14일 내 반환 의무",
      "",
      "[WHY]",
      "3줄 이내. 상황에 직접 대입. 형사처벌(징역·벌금)과 행정처분(과태료·징계) 구분 명시.",
      "",
      "[CASE]",
      "사실관계: [2줄 — 어떤 상황이었는지 구체적으로]",
      "처분결과: 형사 [징역·벌금 종류·금액] | 행정 [과태료·징계 종류]",
      "출처: [기관명] / [연도] / [사건번호 또는 결정번호]",
      "대법원 없으면 국민권익위·감사원·인사혁신처 대체. 생략 절대 금지.",
      "",
      "[ACTION]",
      "① 신고자·목격자 입장이면 '상대방에게 직접 말하지 말 것' 경고 반드시 포함 + 오늘 행동",
      "② 국민권익위 청렴포털 www.clean.go.kr 익명 신고 경로 안내 (24시간 접수)",
      "③ 공익신고자보호법 제13조(신분공개금지)·제15조(불이익조치금지) 신분보호 명시",
      "'팀장에게 법규 보여드리세요', '청렴교육 이수', '소속기관 문의' 비현실적 조치 절대 금지.",
      "",
      "[NEXT]",
      "이 상황과 연결된 후속 질문 2개. 이전 대화 맥락 반영. 물음표로 끝낼 것.",
      "",
      "══ 유형B: [CASES][INTERP] ══",
      "",
      "[CASES]",
      "사례①",
      "기관: 대법원|국민권익위|감사원|인사혁신처 중 하나",
      "연도: YYYY  사건번호: [번호]",
      "사실관계: [2줄]",
      "처분결과: 형사 [징역·벌금] | 행정 [과태료·징계]",
      "적용이유: [1줄]",
      "사례② [동일 형식]  사례③ [동일 형식]",
      "",
      "[INTERP]",
      "국민권익위 YYYY-법령해석-NNNN",
      "[유권해석 요지 2줄]",
      "",
      "══ 유형C: [GUIDE] ══",
      "",
      "[GUIDE]",
      "🛡️ [핵심 답변 1줄]",
      "신고경로: 국민권익위 청렴포털 www.clean.go.kr (익명·실명) | ☎ 1398",
      "신분보호: 공익신고자보호법 §13 신분공개금지, §15 불이익조치금지, 위반 시 3년 이하 징역",
      "실제사례: [기관/연도 + 1줄]",
      "후속질문: [2개, 물음표 끝]",
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
      "1) 질문 유형 분류: 리스크판정→[VERDICT][WHY][CASE][ACTION][NEXT], 판례·판결문·분석·요약·자세히·상세히 요청→[CASES][INTERP], 신고행동→[GUIDE]. 판례/판결문 요청에는 절대 [VERDICT] 포맷 금지.",
      "2) [VERDICT] 둘째 줄: 리스크 XX% — 법령명 §조항: 의무/요건/기한 1줄.",
      "3) [WHY] 형사처벌(징역·벌금)과 행정처분(과태료·징계) 구분 명시.",
      "4) [CASE] 사실관계 2줄 + 처분결과 형사/행정 구분 + 출처. 생략 절대 금지.",
      "5) [ACTION] ①신고자라면 '상대방에게 직접 말하지 말 것', ②www.clean.go.kr 안내, ③공익신고자보호법 신분보호.",
      "6) '판례 없음', '찾지 못했습니다', '직접 검색하세요' 절대 출력 금지.",
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
