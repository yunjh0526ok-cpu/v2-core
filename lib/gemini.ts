/**
 *  lib/gemini.ts
 *  ─────────────────────────────────────────────────────────────────────
 *   Google Gemini — 메인 분석 엔진.
 *
 *   설계 원칙:
 *     1) Gemini 가 1차 엔진. 법령 API 로 수집한 "실제 조문" 을 컨텍스트로
 *        주입해서 hallucination 을 최소화한다. (retrieval-augmented)
 *     2) 결정론적 규칙 엔진(extractSignals / check3510 / scoreArticleText)
 *        의 출력을 함께 넘겨서, LLM 이 수치를 "설명" 하게 한다.
 *     3) JSON schema 로 구조화 출력. 파싱 실패 / 키 없음 / 쿼터 초과 시
 *        자동으로 rule-based 엔진으로 폴백한다.
 *     4) 서버 전용 — 클라이언트 번들 금지.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  LawArticle,
  LawSearchItem,
  RiskAnalysis,
  RiskCitation,
  RiskFactor,
  RiskLevel,
} from "./law-api";

/* ══════════════════════════════════════════════════════════════════════
 *  0. Lazy client
 * ══════════════════════════════════════════════════════════════════════ */

function getKey(): string {
  return process.env.GEMINI_API_KEY?.trim() ?? "";
}

/**
 *  모델 후보 — 지정된 모델이 404 로 실패하면 다음 후보로 자동 폴백.
 *  (Google 이 모델 버전을 주기적으로 EOL 시켜도 서비스가 죽지 않게)
 */
const MODEL_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite-001",
  "gemini-2.0-flash",
];

function getModelCandidates(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (configured) {
    return [configured, ...MODEL_FALLBACKS.filter((m) => m !== configured)];
  }
  return MODEL_FALLBACKS;
}

let _client: GoogleGenerativeAI | null = null;
function getClient(): GoogleGenerativeAI | null {
  const key = getKey();
  if (!key) return null;
  if (!_client) _client = new GoogleGenerativeAI(key);
  return _client;
}

/** 런타임에 검증된 모델을 캐시 — 한 번 성공한 모델을 재사용 */
let _activeModel: string | null = null;

export function isGeminiEnabled(): boolean {
  return getKey().length > 0;
}

let _logged = false;
function logOnce() {
  if (_logged) return;
  _logged = true;
  if (isGeminiEnabled()) {
    const k = getKey();
    console.log(
      `[gemini] 🤖 Gemini enabled — candidates=[${getModelCandidates().join(", ")}] key=${k.slice(0, 6)}…${k.slice(-4)}`
    );
  } else {
    console.warn("[gemini] ⚠ GEMINI_API_KEY not set — LLM features disabled.");
  }
}

/* ══════════════════════════════════════════════════════════════════════
 *  1. 공용 JSON 호출 래퍼
 * ══════════════════════════════════════════════════════════════════════ */

async function callJson<T>(opts: {
  system: string;
  user: string;
  /** 기대 JSON 예시 (프롬프트에 삽입) */
  schemaExample?: unknown;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<T | null> {
  logOnce();
  const client = getClient();
  if (!client) return null;

  const userPrompt =
    opts.user +
    (opts.schemaExample
      ? `\n\n반드시 다음 JSON 스키마 형태로만 응답하세요(설명/마크다운 금지):\n` +
        "```json\n" +
        JSON.stringify(opts.schemaExample, null, 2) +
        "\n```"
      : "");

  //  이미 검증된 모델이 있으면 그것부터, 아니면 후보 전체
  const candidates = _activeModel
    ? [_activeModel, ...getModelCandidates().filter((m) => m !== _activeModel)]
    : getModelCandidates();

  let lastErr: Error | null = null;
  for (const modelName of candidates) {
    try {
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
          responseMimeType: "application/json",
        },
        systemInstruction: opts.system,
      });
      const res = await model.generateContent(userPrompt);
      const text = res.response.text().trim();
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      const parsed = tryParseJson<T>(cleaned);
      if (!parsed) {
        console.warn(
          `[gemini] ${modelName}: JSON parse failed (len=${cleaned.length}), try next`
        );
        lastErr = new Error("JSON parse failed");
        continue;
      }
      if (_activeModel !== modelName) {
        console.log(`[gemini] ✓ active model = ${modelName}`);
        _activeModel = modelName;
      }
      return parsed;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      lastErr = err as Error;
      // 404/NOT_FOUND/UNSUPPORTED/Rate → 다음 모델로. 그 외(인증 실패 등)면 중단.
      const isRetryable =
        /404|NOT_FOUND|not found|not supported|Unsupported|quota|RATE|deadline|timeout/i.test(
          msg
        );
      if (!isRetryable) break;
      console.warn(`[gemini] model ${modelName} unavailable → try next: ${msg.slice(0, 80)}`);
      continue;
    }
  }
  console.warn(
    "[gemini] callJson failed on all candidates, falling back:",
    lastErr?.message
  );
  return null;
}

/**
 *  JSON 파싱 — 토큰 한도로 끝이 잘린 응답도 '마지막 성공 위치까지' 복구 시도.
 *  - 정상 JSON.parse → 즉시 반환
 *  - 실패 시, 문자열을 뒤에서부터 한 글자씩 줄여가며 JSON 으로 파싱 재시도
 *    (맨 끝 ","/"}]" 을 보정해서)
 */
function tryParseJson<T>(raw: string): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    /* 아래로 */
  }
  // 가장 마지막 닫는 } 까지만 잘라내고 시도
  const lastBrace = raw.lastIndexOf("}");
  if (lastBrace > 0) {
    const candidate = raw.slice(0, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* noop */
    }
  }
  // 미완성 배열 보정 시도: 열려 있는 "[", "{" 개수를 세어 닫기
  const open = (raw.match(/[\{\[]/g) || []).length;
  const close = (raw.match(/[\}\]]/g) || []).length;
  if (open > close) {
    const closers = raw
      .split("")
      .reduce<string[]>((stack, ch) => {
        if (ch === "{") stack.push("}");
        else if (ch === "[") stack.push("]");
        else if (ch === "}" || ch === "]") stack.pop();
        return stack;
      }, [])
      .reverse()
      .join("");
    // 미완성 문자열 보정: 마지막 따옴표가 열린 채 끝났으면 닫아줌
    const openQuotes =
      (raw.match(/(?<!\\)"/g) || []).length % 2 === 1 ? '"' : "";
    const patched = raw + openQuotes + closers;
    try {
      return JSON.parse(patched) as T;
    } catch {
      /* give up */
    }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
 *  1-b. 공용 TEXT 호출 래퍼 (Eco Chat 등 자유형 응답용)
 * ══════════════════════════════════════════════════════════════════════ */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export async function callText(opts: {
  system: string;
  messages: ChatMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<string | null> {
  logOnce();
  const key = getKey();
  if (!key) return null;

  //  SDK 우회 — Gemini 공식 REST v1beta 에 직접 POST.
  //  - SDK 가 일부 환경에서 deprecated 모델을 강제해 404 를 내는 문제를 회피.
  //  - 시스템 프롬프트는 첫 user 메시지에 인라인으로 합성.
  const userMsgs = opts.messages.filter((m) => m.content.trim().length > 0);
  if (userMsgs.length === 0) return null;

  const contents: Array<{ role: "user" | "model"; parts: { text: string }[] }> =
    [];
  userMsgs.forEach((m) => {
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  });
  while (contents.length > 0 && contents[0].role !== "user") contents.shift();
  if (contents.length === 0) return null;

  //  2.5-flash 의 'thinking' 토큰이 maxOutputTokens 를 선점해 응답이 잘리는 문제 방지.
  //  thinkingBudget=0 으로 추론 토큰을 끄고 full budget 을 답변에 사용한다.
  const body = JSON.stringify({
    contents,
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.35,
      maxOutputTokens: opts.maxOutputTokens ?? 1200,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const candidates = _activeModel
    ? [_activeModel, ...getModelCandidates().filter((m) => m !== _activeModel)]
    : getModelCandidates();

  let lastErr: Error | null = null;
  for (const modelName of candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const errText = await res.text();
        const msg = `[${res.status}] ${errText.slice(0, 180)}`;
        lastErr = new Error(msg);
        const retry =
          res.status === 404 ||
          res.status === 429 ||
          res.status === 500 ||
          res.status === 503;
        console.warn(
          `[gemini] text model ${modelName} unavailable (HTTP ${res.status}) → try next`
        );
        if (!retry) break;
        continue;
      }
      const json = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
      };
      const text =
        json.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim() ?? "";
      if (!text) {
        lastErr = new Error("empty text");
        continue;
      }
      if (_activeModel !== modelName) {
        console.log(`[gemini] ✓ active model = ${modelName} (text · REST)`);
        _activeModel = modelName;
      }
      return text;
    } catch (err) {
      const msg = (err as Error).message || String(err);
      lastErr = err as Error;
      console.warn(
        `[gemini] text model ${modelName} network error → try next: ${msg.slice(0, 80)}`
      );
      continue;
    }
  }
  console.warn(
    "[gemini] callText failed on all candidates, falling back:",
    lastErr?.message
  );
  return null;
}

/* ══════════════════════════════════════════════════════════════════════
 *  2. Legal-Guide — 리스크 분석 고도화
 * ══════════════════════════════════════════════════════════════════════ */

/**
 *  Gemini 가 반환할 구조화 JSON.
 *  - 점수/레벨은 규칙 엔진 결과를 "참고"해서 조정하게 함.
 */
type GeminiRiskShape = {
  riskScore: number;
  riskLevel: RiskLevel;
  summaryKo: string;
  keyIssues: string[]; // 2~4줄 쟁점
  additionalCitations?: Array<{ statute: string; clause: string; reason: string }>;
  recommendations: string[];
  followUpQuestions?: string[]; // 챗봇용 후속 질문 2~3개
  confidence: "low" | "medium" | "high";
};

export type EnhancedRiskAnalysis = RiskAnalysis & {
  /** Gemini 가 생성한 자연어 상세 해설 */
  narrative: string;
  keyIssues: string[];
  followUpQuestions: string[];
  /** 분석 엔진 종류 */
  engine: "gemini+rules" | "rules-only";
  confidence: "low" | "medium" | "high";
};

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^#{1,6}\s/gm, "")
    .replace(/^[\*\-]\s/gm, "")
    .trim();
}

/**
 *  규칙 엔진이 이미 계산한 `base` 분석을, Gemini 로 "덧씌워" 강화.
 *  - 법령 API 조문 원문을 컨텍스트로 주입 → hallucination 억제
 *  - Gemini 실패 시 base 를 그대로 돌려주되 engine = rules-only
 */
export async function enhanceRiskWithGemini(
  base: RiskAnalysis,
  relatedArticles: LawArticle[] = [],
  history: Array<{ role: "user" | "model"; content: string }> = []
): Promise<EnhancedRiskAnalysis> {
  if (!isGeminiEnabled()) {
    return toRulesOnly(base);
  }

  const systemPrompt = [
    "당신은 대한민국 공직자 청렴 전문 법률 AI 'LexGuard'입니다.",
    "사용자는 항상 공직자 또는 공공기관 종사자입니다.",
    "이전 대화 맥락을 반드시 유지하며, 연속 질문은 앞선 상황의 연장선으로 해석하세요.",
    "마크다운 기호(**, *, ##, -, •) 절대 출력 금지. 추측 금지.",
    "'판례 없음', '찾지 못했습니다', '직접 검색하세요', '검색 결과가 없습니다' 절대 출력 금지.",
    "",
    "▶ 질문 유형 자동 분류 — summaryKo 에 유형별 포맷만 사용:",
    "· 리스크 판정(~해도 되나요, ~위법인가요, ~괜찮나요, ~받아도 되나요): [VERDICT][WHY][CASE][ACTION][NEXT]",
    "· 판례·정보 요청(판례, 사례, 처벌이 어떻게, 자세히, 상세히): [CASES][INTERP]",
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
    "예: '형사: 3년 이하 징역 또는 3천만원 이하 벌금. 행정: 과태료 금품가액 2~5배.'",
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
    "'팀장에게 법규 보여드리세요', '청렴교육 이수', '소속기관 문의' 같은 비현실적 조치 절대 금지.",
    "",
    "[NEXT]",
    "이 상황과 연결된 후속 질문 2개. 이전 대화 맥락 반영. 물음표로 끝낼 것.",
    "",
    "══ 유형B: [CASES][INTERP] ══",
    "",
    "[CASES]",
    "사례①",
    "기관: 대법원|국민권익위|감사원|인사혁신처 중 하나",
    "연도: YYYY",
    "사건번호: [번호, 불확실하면 [추정] 표시]",
    "사실관계: [2줄 — 구체적 상황]",
    "처분결과: 형사 [징역·벌금] | 행정 [과태료·징계]",
    "적용이유: [현재 상황과 연결점 1줄]",
    "",
    "사례② [동일 형식]",
    "사례③ [동일 형식]",
    "",
    "[INTERP]",
    "국민권익위 YYYY-법령해석-NNNN (또는 유사번호)",
    "[유권해석 요지 2줄]",
    "",
    "══ 유형C: [GUIDE] ══",
    "",
    "[GUIDE]",
    "🛡️ [핵심 답변 1줄]",
    "신고경로: 국민권익위 청렴포털 www.clean.go.kr (익명·실명 모두 가능) | ☎ 1398",
    "신분보호: 공익신고자보호법 §13 신분공개금지, §15 불이익조치금지, 위반 시 3년 이하 징역",
    "실제사례: [기관/연도] [신고 후 보호받은 사례 1줄]",
    "후속질문: [2개, 물음표로 끝낼 것]",
    "",
    "결과는 오직 JSON 으로만 반환합니다 (마크다운 블록 금지).",
  ].join("\n");

  const factorLines = base.factors
    .map(
      (f) =>
        `  - ${f.label}  (${f.delta > 0 ? "+" : ""}${f.delta}점)  ·  ${f.detail}`
    )
    .join("\n");

  const citationLines = base.citations
    .map((c) => `  - ${c.statute} · ${c.clause}${c.excerpt ? ` — "${c.excerpt}"` : ""}`)
    .join("\n");

  const articleLines = relatedArticles
    .slice(0, 4)
    .map(
      (a) =>
        `  ▸ 제${a.no}${a.sub ? "의" + a.sub : ""}조 ${a.title}\n    ${a.content.replace(/\s+/g, " ").slice(0, 500)}`
    )
    .join("\n\n");

  const historyLines =
    history.length > 0
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
      : [];

  const userPrompt = [
    ...historyLines,
    `## 사용자 상황`,
    base.prompt,
    ``,
    `## 규칙 엔진 선행 계산`,
    `- 종합 리스크: ${base.riskScore}% (${base.riskLevel})`,
    `- 팩터:`,
    factorLines || "  (없음)",
    ``,
    `## 인용된 법령 근거`,
    citationLines || "  (없음)",
    ``,
    `## 법령 API 로 가져온 관련 조문 원문`,
    articleLines || "  (조문 조회 실패)",
    ``,
    `## 과제`,
    `위 규칙 엔진 결과를 검토하고 필요 시 점수를 ±10 범위에서 조정하세요.`,
    `summaryKo 는 질문 유형에 따라 [VERDICT][WHY][CASE][ACTION][NEXT] / [CASES][INTERP] / [GUIDE] 중 하나로 작성.`,
    `[VERDICT] 둘째 줄: 리스크 XX% — 법령명 §조항: 의무/요건/기한 1줄.`,
    `[WHY] 형사처벌(징역·벌금)과 행정처분(과태료·징계) 구분 명시.`,
    `[CASE] 사실관계 2줄 + 처분결과 형사/행정 구분 + 출처 형식. 생략 절대 금지.`,
    `[ACTION] ①신고자라면 '상대방에게 직접 말하지 말 것' 포함, ②www.clean.go.kr 안내, ③공익신고자보호법 신분보호.`,
    `keyIssues 는 법적 쟁점 2~3개. recommendations 는 행동 동사형 3개. followUpQuestions 는 2개.`,
  ].join("\n");

  const schema: GeminiRiskShape = {
    riskScore: 0,
    riskLevel: "LOW",
    summaryKo:
      "[VERDICT]\n❌ 판정문\n리스크 82% — 청탁금지법 §8①: 직무관련자 금품 14일 내 반환 의무\n\n[WHY]\n형사: 3년 이하 징역 또는 3천만원 이하 벌금. 행정: 과태료 금품가액 2~5배.\n구체 상황 설명 2줄.\n\n[CASE]\n사실관계: 구체적 상황 1줄\n            구체적 상황 2줄\n처분결과: 형사 징역 6월 집행유예 1년 | 행정 과태료 200만원\n출처: 국민권익위 / 2023 / 권익위 2023-결정-0456\n\n[ACTION]\n① 상대방에게 직접 말하지 말 것. 금품 즉시 반환 거부 의사 서면 통보.\n② www.clean.go.kr 익명 신고 (24시간 접수 가능)\n③ 공익신고자보호법 제13조·제15조 신분보호 적용\n\n[NEXT]\n후속 질문 1?\n후속 질문 2?",
    keyIssues: ["쟁점 1", "쟁점 2"],
    additionalCitations: [
      { statute: "법령명", clause: "제X조(제목)", reason: "이 조문을 적용하는 이유" },
    ],
    recommendations: ["권고 1", "권고 2", "권고 3"],
    followUpQuestions: ["후속 질문 1", "후속 질문 2"],
    confidence: "medium",
  };

  const out = await callJson<GeminiRiskShape>({
    system: systemPrompt,
    user: userPrompt,
    schemaExample: schema,
    temperature: 0.3,
    maxOutputTokens: 3200,
  });

  if (!out) return toRulesOnly(base);

  // LLM 결과와 규칙 엔진 결과를 merge
  const geminiScore = clamp(Number(out.riskScore) || base.riskScore, 0, 100);
  // 규칙 엔진 점수에서 ±12 이상 이탈 방지 (hallucination 억제)
  const mergedScore = clamp(
    Math.round(base.riskScore * 0.6 + geminiScore * 0.4),
    Math.max(0, base.riskScore - 12),
    Math.min(99, base.riskScore + 12)
  );

  const mergedLevel: RiskLevel =
    mergedScore >= 85
      ? "CRITICAL"
      : mergedScore >= 65
        ? "HIGH"
        : mergedScore >= 40
          ? "MEDIUM"
          : "LOW";

  const addCitations: RiskCitation[] = (out.additionalCitations ?? [])
    .filter((c) => c && c.statute && c.clause)
    .map((c) => ({ statute: c.statute, clause: c.clause, excerpt: c.reason }));

  const mergedCitations = dedupCitations([...base.citations, ...addCitations]).slice(0, 6);

  const mergedRecs = uniq([
    ...(out.recommendations ?? []).filter(Boolean),
    ...base.recommendations,
  ]).slice(0, 6);

  const factorsWithGemini: RiskFactor[] = [
    ...base.factors,
    {
      label: "Gemini LLM 분석 반영",
      delta: mergedScore - base.riskScore,
      detail: `신뢰도 ${out.confidence ?? "medium"} · ${(out.keyIssues ?? []).join(" / ")}`,
    },
  ];

  return {
    ...base,
    riskScore: mergedScore,
    riskLevel: mergedLevel,
    summary: buildEnhancedSummary(base, out, mergedScore, mergedLevel),
    narrative: stripMarkdown(out.summaryKo),
    keyIssues: out.keyIssues ?? [],
    followUpQuestions: out.followUpQuestions ?? [],
    citations: mergedCitations,
    recommendations: mergedRecs,
    factors: factorsWithGemini,
    engine: "gemini+rules",
    confidence: out.confidence ?? "medium",
  };
}

function toRulesOnly(base: RiskAnalysis): EnhancedRiskAnalysis {
  const top = base.citations[0];
  const narrative = [
    `[상황 진단]`,
    `이 상황은 규칙 엔진 분석 기준 ${base.riskScore}% (${base.riskLevel}) 리스크로 판정됩니다.` +
      ` 핵심은 ${base.summary.split("\n")[0]}`,
    ``,
    `[법령 근거]`,
    top
      ? `가장 먼저 적용될 조항은 ${top.statute} ${top.clause} 입니다. ` +
        `해당 조항 기준으로 사실관계 입증이 필요합니다.`
      : `직접 인용 조항을 추출하지 못했습니다. 유사 사례는 청탁금지법·이해충돌방지법을 1차 기준으로 검토합니다.`,
    ``,
    `[변호사 조언]`,
    `판단이 애매할수록 초기 대응(거절·보존·보고)을 즉시 문서화하고, 사실관계별 증거를 시간순으로 정리하세요.`,
    ``,
    `[권고 조치]`,
    ...base.recommendations
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.replace(/^\s*\d+\.\s*/, "")}`),
  ].join("\n");
  return {
    ...base,
    narrative,
    keyIssues: base.citations.map((c) => `${c.statute} · ${c.clause}`),
    followUpQuestions: [
      "유사 사례의 실제 징계 수위가 궁금합니다.",
      "내부 신고 절차를 구체적으로 알려주세요.",
    ],
    engine: "rules-only",
    confidence: "medium",
  };
}

function buildEnhancedSummary(
  base: RiskAnalysis,
  g: GeminiRiskShape,
  score: number,
  level: RiskLevel
): string {
  const top = base.citations[0];
  return (
    `[AI 법령 분석 · Gemini 강화]\n` +
    `- 종합 리스크: ${score}% (${level}) · 신뢰도 ${g.confidence}\n` +
    (top ? `- 핵심 근거: ${top.statute} · ${top.clause}\n` : "") +
    `${g.summaryKo}`
  );
}

/* ══════════════════════════════════════════════════════════════════════
 *  3. Intelligence Hub — 진단 리포트 자동 작성
 * ══════════════════════════════════════════════════════════════════════ */

export type HubReportInput = {
  institutionName?: string;
  consultationCount: number;
  /** 시나리오별 상담 건수 */
  scenarioBreakdown: Record<string, number>;
  /** 최근 리스크 점수 배열 */
  recentRiskScores: number[];
  /** 부서별 리스크 */
  departmentRisk?: Array<{ department: string; score: number }>;
  /** 직원 설문/토론 결과 요약 */
  dialogueHighlights?: string[];
};

export type HubReportOutput = {
  executiveSummary: string;
  keyFindings: string[];
  risks: Array<{ title: string; severity: "low" | "med" | "high"; detail: string }>;
  recommendations: Array<{ title: string; owner: string; deadline: string }>;
  nextQuarterFocus: string[];
  engine: "gemini" | "rules";
};

/**
 *  Hub 대시보드의 "청렴 진단 리포트" 를 LLM 으로 자동 작성.
 */
export async function generateDiagnosticReport(
  input: HubReportInput
): Promise<HubReportOutput> {
  const avg =
    input.recentRiskScores.length > 0
      ? Math.round(
          input.recentRiskScores.reduce((a, b) => a + b, 0) / input.recentRiskScores.length
        )
      : 0;

  if (!isGeminiEnabled()) return buildFallbackReport(input, avg);

  const schema: HubReportOutput = {
    executiveSummary: "4~6문장 경영진용 요약",
    keyFindings: ["발견 1", "발견 2", "발견 3"],
    risks: [
      { title: "리스크 제목", severity: "high", detail: "상세 설명과 근거" },
    ],
    recommendations: [
      { title: "권고 조치", owner: "감사담당관", deadline: "2026 Q2" },
    ],
    nextQuarterFocus: ["차분기 우선 과제 1", "차분기 우선 과제 2"],
    engine: "gemini",
  };

  const out = await callJson<HubReportOutput>({
    system: [
      "당신은 공공기관 청렴도 평가를 15년 수행해 온 수석 컨설턴트입니다.",
      "기관의 상담/토론/설문 데이터를 받아서 이사회에 올릴 수준의 진단 리포트를",
      "한국어로 작성합니다. 구체적 수치 근거를 포함하되, 추측은 명시합니다.",
    ].join("\n"),
    user: [
      `## 기관: ${input.institutionName ?? "미지정"}`,
      `## 기간 상담 건수: ${input.consultationCount}`,
      `## 평균 리스크 점수: ${avg}%`,
      `## 시나리오 분포`,
      ...Object.entries(input.scenarioBreakdown).map(
        ([k, v]) => `  - ${k}: ${v}건`
      ),
      `## 최근 리스크 추이 (최신순)`,
      input.recentRiskScores.slice(0, 12).join(", ") || "(없음)",
      input.departmentRisk
        ? `## 부서별 리스크\n` +
          input.departmentRisk.map((d) => `  - ${d.department}: ${d.score}`).join("\n")
        : "",
      input.dialogueHighlights
        ? `## 토론 하이라이트\n` + input.dialogueHighlights.map((d) => `  - ${d}`).join("\n")
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schemaExample: schema,
    temperature: 0.3,
    maxOutputTokens: 2400,
  });

  if (!out) return buildFallbackReport(input, avg);
  return { ...out, engine: "gemini" };
}

function buildFallbackReport(input: HubReportInput, avg: number): HubReportOutput {
  void avg; // avg 는 executiveSummary 문장에서만 문자열로 사용
  const sorted = Object.entries(input.scenarioBreakdown).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  return {
    executiveSummary:
      `최근 ${input.consultationCount}건의 Legal-Guide 상담에서 평균 리스크 ${avg}% 를 기록했습니다.` +
      (top ? ` 가장 빈번한 쟁점은 "${top[0]}" 계열(${top[1]}건) 이며, ` : "") +
      `상담 내역이 리포트에 실시간 누적되고 있습니다.`,
    keyFindings: [
      `평균 리스크 점수: ${avg}%`,
      `총 상담 수: ${input.consultationCount}`,
      ...sorted.slice(0, 3).map(([k, v]) => `${k} 쟁점 ${v}건 발생`),
    ],
    risks: sorted.slice(0, 3).map(([k, v]) => ({
      title: `${k} 유형 집중 발생`,
      severity: v >= 5 ? "high" : v >= 2 ? "med" : "low",
      detail: `${v}건의 상담 누적. 해당 쟁점의 내부 교육 및 사전 컨설팅 필요.`,
    })),
    recommendations: [
      { title: "청렴옴부즈만 상시 상담 채널 안내", owner: "감사담당관", deadline: "즉시" },
      { title: "상위 쟁점 2개 유형 전 직원 리프레셔 교육", owner: "인사팀", deadline: "익월" },
      { title: "Legal-Guide 상담 데이터 분기 점검", owner: "감사팀", deadline: "분기" },
    ],
    nextQuarterFocus: [
      "상담 건수 대비 실제 신고 전환율 측정",
      "부서별 리스크 편차 모니터링",
    ],
    engine: "rules",
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  4. Dialogue — 의견 감정/쟁점 분류
 * ══════════════════════════════════════════════════════════════════════ */

export type DialogueAnalysis = {
  sentiment: "positive" | "neutral" | "concern" | "negative";
  topic: string;
  keywords: string[];
  suggestedCoachTip: string;
  engine: "gemini" | "rules";
};

/**
 *  현장 토론에서 수집된 의견 텍스트를 분류.
 *  강사가 실시간으로 볼 "AI 코치" 힌트까지 생성.
 */
export async function analyzeDialogueComment(
  text: string
): Promise<DialogueAnalysis> {
  if (!isGeminiEnabled()) return ruleBasedDialogue(text);

  const schema: DialogueAnalysis = {
    sentiment: "neutral",
    topic: "주제 한 줄",
    keywords: ["키워드1", "키워드2"],
    suggestedCoachTip: "강사용 코칭 힌트 한 문장",
    engine: "gemini",
  };
  const out = await callJson<DialogueAnalysis>({
    system:
      "당신은 청렴 교육 현장의 AI 퍼실리테이터입니다. 참여자 의견을 4단 감정으로 분류하고, 강사가 다음 슬라이드 전에 즉시 활용할 팁을 1문장으로 제시합니다.",
    user: `참여자 의견: "${text}"\n이 의견이 토론 흐름에서 어떤 위치에 있는지, 강사는 어떻게 이어가면 좋을지 JSON 으로 답하세요.`,
    schemaExample: schema,
    temperature: 0.4,
    maxOutputTokens: 400,
  });
  return out ? { ...out, engine: "gemini" } : ruleBasedDialogue(text);
}

function ruleBasedDialogue(text: string): DialogueAnalysis {
  const s = text.replace(/\s+/g, " ");
  const negative = /부당|부패|갑질|답답|싫|화|불합리|모순|불신/.test(s);
  const concern = /고민|걱정|어떻게|문제|리스크|우려/.test(s);
  const positive = /감사|좋|동의|찬성|희망/.test(s);
  const sentiment: DialogueAnalysis["sentiment"] = negative
    ? "negative"
    : concern
      ? "concern"
      : positive
        ? "positive"
        : "neutral";
  return {
    sentiment,
    topic: guessTopic(s),
    keywords: s
      .split(/[\s.,!?]+/)
      .filter((w) => w.length >= 2)
      .slice(0, 5),
    suggestedCoachTip:
      sentiment === "negative"
        ? "부정적 의견을 경청하고, 구체 사례로 전환해 집단 공감대를 만드세요."
        : sentiment === "concern"
          ? "해당 고민을 다음 슬라이드의 법령 근거와 직접 연결해 해소해 보세요."
          : "동의 의견은 다른 관점을 가진 참가자에게 질문을 던져 토론을 확장하세요.",
    engine: "rules",
  };
}

function guessTopic(s: string): string {
  if (/청탁|금품|선물/.test(s)) return "금품·청탁";
  if (/가족|이해충돌/.test(s)) return "이해충돌";
  if (/갑질|괴롭힘/.test(s)) return "직장 내 괴롭힘";
  if (/계약|입찰/.test(s)) return "계약·입찰";
  return "일반 청렴";
}

/* ══════════════════════════════════════════════════════════════════════
 *  5. Ethics-Drama — Fact → 숏폼 드라마 각색
 * ══════════════════════════════════════════════════════════════════════ */

export type DramatizeInput = {
  /** 원천 사실 관계 (강사가 입력). 자유 텍스트. */
  facts: string;
  /** 분류 (청탁 / 이해충돌 / 갑질 / 예산·계약 / 인사·채용 / 정보보안) */
  category?: string;
  /** 참조 법령·조항 힌트 (있으면 각색의 정확도↑) */
  lawHints?: Array<{ statute: string; clause?: string }>;
  /** 실제 판례의 징계 결과 (있으면 '파멸' 단계에 반영) */
  realOutcome?: string;
};

export type DramatizeOutput = {
  /** URL용 슬러그 후보 (한글 제거, kebab-case) */
  slug: string;
  /** 호기심을 자극하는 제목 (예: "커피 한 잔이 정직 3개월이 된 사연") */
  title: string;
  /** 훅 카피 1문장 */
  hook: string;
  /** 대표 이모지 1개 */
  heroEmoji: string;
  /** 1단: 사건의 발단 (3~5문장, 숏폼 드라마 톤) */
  stageStart: string;
  /** 2단: 갈등 · 선택의 기로 (3~5문장) */
  stageConflict: string;
  /** 3단: 파멸 · 징계 결과 (3~5문장) */
  stageFall: string;
  /** 실제 판례 결과 요약 (사실 기반, 건조한 톤) */
  outcome: string;
  /** Dilemma Quiz 질문 */
  quizQuestion: string;
  /** 2~4개 선택지 (첫 번째가 "함정", 마지막이 "정답" 성향으로 배치) */
  quizOptions: Array<{
    label: string;
    alignment: number; // 0~100 판례 정합도
    commentary: string; // 왜 이 선택이 위반/정답인지
    isCorrect: boolean;
  }>;
  /** 강사 코멘트 톤의 짧은 교훈 */
  authorNote: string;
  /** 어떤 엔진으로 생성됐는지 */
  engine: "gemini" | "rules";
};

/**
 *  원천 판례 사실(Fact)을 숏폼 드라마 3막 구조 + Dilemma Quiz 로 각색.
 *  - 강사가 20년치 원천 데이터를 넣으면 Gemini Pro 가 '흥미진진한' 카드뉴스 텍스트로 변환.
 *  - 금지: 실명, 근무처 특정, 허위 창작(사실과 모순되는 법령 인용).
 */
export async function dramatizeCase(
  input: DramatizeInput
): Promise<DramatizeOutput> {
  if (!isGeminiEnabled()) return buildFallbackDrama(input);

  const schema: DramatizeOutput = {
    slug: "coffee-3-month-suspension",
    title: "커피 한 잔이 정직 3개월이 된 사연",
    hook: "작은 호의가 큰 재판이 되는 순간.",
    heroEmoji: "☕",
    stageStart:
      "평범한 수요일 오후, 민원인의 종이컵 커피 한 잔이 조용히 책상 위에 놓였다.",
    stageConflict:
      "거절하자니 분위기가 어색해진다. 받자니 직무관련성이 마음에 걸린다.",
    stageFall:
      "3개월 뒤, 같은 민원인의 이름이 결재 라인에 올라왔다. 감사팀의 질문은 예상보다 집요했다.",
    outcome:
      "청탁금지법 제8조 위반으로 징계위가 열렸고, 정직 3개월이 의결됐다.",
    quizQuestion: "당신이라면 이 상황에서 어떤 선택을 하겠습니까?",
    quizOptions: [
      {
        label: "고맙게 받고 넘어간다",
        alignment: 10,
        commentary: "직무관련자의 호의는 금액과 무관하게 금지 대상입니다.",
        isCorrect: false,
      },
      {
        label: "정중히 거절하고 그 자리에서 돌려준다",
        alignment: 85,
        commentary: "현장에서의 즉시 거절이 판례상 가장 안전한 대응입니다.",
        isCorrect: true,
      },
      {
        label: "일단 받고 청렴포털에 자진신고",
        alignment: 60,
        commentary:
          "신고 요건을 충족하지만, 가능하면 애초에 받지 않는 것이 원칙입니다.",
        isCorrect: false,
      },
    ],
    authorNote:
      "현장에서 본 패턴은 언제나 같습니다 — 작은 호의에서 시작해 결재 라인에서 끝납니다.",
    engine: "gemini",
  };

  const sys = [
    "당신은 대한민국 공직 청렴·윤리 분야 20년 경력의 베테랑 작가 겸 법률 컨설턴트입니다.",
    "역할: 강사가 제공한 '원천 판례 사실(facts)'을 숏폼 드라마 3막 구조로 각색합니다.",
    "",
    "톤 & 스타일:",
    "  · 넷플릭스 숏폼 드라마 같은 장면 묘사 (현장 냄새, 긴장, 심리).",
    "  · 과장·연출은 OK. 그러나 '법적 결론'은 반드시 사실과 원문 법령에 부합해야 함.",
    "  · 제목은 호기심 유발형 1문장 (예: '커피 한 잔이 정직 3개월이 된 사연').",
    "  · 각 스테이지 3~5문장, 문어체로.",
    "",
    "엄격한 금지사항:",
    "  · 실명, 실제 기관명, 지역, 부서명 사용 금지 (모두 익명화).",
    "  · 사실 관계에 없는 추가 혐의 창작 금지.",
    "  · 법령명·조항을 지어내지 말 것 (사용자가 제공한 lawHints 범위 내에서만).",
    "",
    "Dilemma Quiz:",
    "  · 선택지는 3~4개.",
    "  · '판례와 가장 정합하는 옵션' 정확히 1개만 isCorrect=true.",
    "  · alignment 는 0~100 (0=완전 위반, 100=완전 정답).",
    "  · commentary 는 각 선택이 왜 그런 점수인지 1문장.",
  ].join("\n");

  const user = [
    `## 원천 사실 관계 (facts)`,
    input.facts,
    "",
    input.category ? `## 카테고리: ${input.category}` : "",
    input.lawHints && input.lawHints.length
      ? `## 참조 법령 힌트\n` +
        input.lawHints
          .map(
            (h, i) =>
              `  ${i + 1}. ${h.statute}${h.clause ? ` · ${h.clause}` : ""}`
          )
          .join("\n")
      : "",
    input.realOutcome
      ? `## 실제 판례의 징계/결과\n${input.realOutcome}`
      : "",
    "",
    "위 사실을 기반으로 숏폼 드라마 3막 + Dilemma Quiz 로 각색해 주세요.",
    "slug 는 영문 소문자/숫자/하이픈만 사용 (한글·공백 금지).",
  ]
    .filter(Boolean)
    .join("\n");

  const out = await callJson<DramatizeOutput>({
    system: sys,
    user,
    schemaExample: schema,
    temperature: 0.7, // 드라마틱한 각색을 위해 창의성↑
    maxOutputTokens: 2600,
  });

  if (!out) return buildFallbackDrama(input);

  // 최소 검증 & 정규화
  const slug = (out.slug || "drama")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

  // isCorrect 가 정확히 1개가 되도록 강제
  const opts = (out.quizOptions || []).map((o) => ({
    ...o,
    alignment: clamp(Math.round(o.alignment), 0, 100),
  }));
  let correctIdx = opts.findIndex((o) => o.isCorrect);
  if (correctIdx < 0) {
    // alignment 가장 높은 옵션을 정답으로
    correctIdx = opts.reduce(
      (best, o, i) => (o.alignment > opts[best].alignment ? i : best),
      0
    );
    opts.forEach((o, i) => (o.isCorrect = i === correctIdx));
  } else {
    // 중복 정답 제거
    opts.forEach((o, i) => (o.isCorrect = i === correctIdx));
  }

  return {
    ...out,
    slug,
    quizOptions: opts.length >= 2 ? opts : schema.quizOptions,
    engine: "gemini",
  };
}

export function buildFallbackDrama(input: DramatizeInput): DramatizeOutput {
  const firstLine = input.facts.split(/[\.!?\n]/)[0]?.trim() || "한 공직자의 이야기";
  return {
    slug: `drama-${Date.now().toString(36)}`,
    title: `${input.category ?? "청렴"} 한 컷: ${firstLine.slice(0, 24)}…`,
    hook: "작은 습관이 만든 큰 파장을 기록합니다.",
    heroEmoji: "⚖️",
    stageStart:
      "모든 것은 평범한 오후에서 시작되었다. 작은 호의는 아직 작아 보였다.\n\n" +
      `[원천 사실 요약]\n${input.facts.slice(0, 240)}`,
    stageConflict:
      "받을 것인가, 거절할 것인가. 짧은 침묵 사이에 20년의 경력이 흔들렸다. 마음속에선 여러 목소리가 경쟁했다.",
    stageFall:
      input.realOutcome ??
      "시간이 흐른 뒤, 결재 라인에서 그 이름이 다시 나타났다. 감사팀의 조사가 시작됐다.",
    outcome:
      input.realOutcome ??
      "관련 법령 위반으로 징계 절차가 개시되었고, 재발 방지를 위한 기관 차원의 조치가 뒤따랐다.",
    quizQuestion: "당신이라면 이 상황에서 어떤 선택을 하겠습니까?",
    quizOptions: [
      {
        label: "호의니까 받아 둔다",
        alignment: 15,
        commentary: "직무관련자의 제공은 금액과 무관하게 금지 대상입니다.",
        isCorrect: false,
      },
      {
        label: "즉시 거절하고 기록을 남긴다",
        alignment: 90,
        commentary: "현장 즉시 거절 + 서면 기록이 가장 안전한 대응입니다.",
        isCorrect: true,
      },
      {
        label: "감사담당관과 상의 후 결정",
        alignment: 70,
        commentary:
          "의심스러울 때 상의하는 습관은 훌륭하지만, 원칙은 '받지 않기'입니다.",
        isCorrect: false,
      },
    ],
    authorNote:
      "현장의 작은 호의가 징계 기록이 되는 경로는 늘 같습니다. '즉시 거절'은 가장 저렴한 보험입니다.",
    engine: "rules",
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  6. Deep Diagnose — 실전형 법률 방어·대응 브리핑
 *
 *   Legal-Guide '심층 진단 모드' 전용. 사용자가 구조화된 컨텍스트
 *   (직무유형·사건개요·관계·증거·반복성·현재단계)를 제공하면,
 *   Gemini 가 아래 섹션을 생성:
 *     · 예상 처분 수위 분포 (예: 정직 55% / 감봉 30% / 견책 15%)
 *     · 증거 확보 체크리스트 (무엇을 남기고 무엇을 삭제하면 안 되는지)
 *     · 말·문자 조심 가이드 (조사 전후 발언의 함정)
 *     · 공익신고자 보호 실전 (판례 기반 '이렇게 해서 신분 보장됨')
 *     · 표적감사·보복 방어책
 *     · 긴급 단계별 24·72시간 액션 타임라인
 * ══════════════════════════════════════════════════════════════════════ */

export type DeepContext = {
  /** 상황 원문 (핵심 prompt) */
  situation: string;
  /** 직무 유형 — 예: 계약·인사·감사·민원·일반행정 */
  role?: string;
  /** 상대방과의 관계 — 예: 직무관련자·친족·민원인·상급자 */
  relation?: string;
  /** 반복/1회성 */
  frequency?: "once" | "repeat" | "unknown";
  /** 보유 증거 — 예: 카톡, 이메일, CCTV, 영수증 */
  evidence?: string[];
  /** 현재 단계 — 예: 미발각·내부감사진행·수사개시·징계위회부 */
  currentStage?:
    | "before"
    | "internal-audit"
    | "investigation"
    | "disciplinary"
    | "post";
  /** 내부 신고 여부 */
  reported?: boolean;
  /** 관심 모드 — 방어(defense) / 적극행정 면책(active-admin) */
  mode?: "defense" | "active-admin";
};

export type PredictedDiscipline = {
  type: string; // 견책·감봉·정직·강등·해임·파면·면책·표창·처분없음
  probability: number; // 0~100
  reasoning: string;
};

export type DefenseBrief = {
  situationSummary: string;

  /** 예상 처분 분포 (합 100) */
  predictedDiscipline: PredictedDiscipline[];

  /** 증거 확보 체크리스트 */
  evidenceChecklist: Array<{
    action: string;
    why: string;
    priority: "high" | "medium" | "low";
  }>;

  /** 발언/기록 조심 가이드 */
  languageCautions: Array<{
    situation: string;
    dont: string;
    do: string;
  }>;

  /** 공익신고자 보호 실전 전략 */
  whistleblowerPlaybook: Array<{
    step: string;
    detail: string;
    lawRef?: string;
  }>;

  /** 보복·표적감사 방어책 */
  retaliationDefense: Array<{
    risk: string;
    countermeasure: string;
  }>;

  /** 24h / 72h / 7d 단계별 액션 */
  timeline: Array<{
    window: "24h" | "72h" | "7d" | "30d";
    actions: string[];
  }>;

  /** 적극행정 면책 적용 가능성 (mode=active-admin 시 상세) */
  activeAdminImmunity?: {
    applicable: boolean;
    confidence: "low" | "medium" | "high";
    rationale: string;
    requiredDocs: string[];
  };

  /** 최종 한 문장 경고 */
  redLine: string;

  engine: "gemini" | "fallback";
};

export async function deepDiagnose(
  ctx: DeepContext,
  base: RiskAnalysis,
  relatedArticles: LawArticle[] = []
): Promise<DefenseBrief> {
  if (!isGeminiEnabled()) return fallbackDefenseBrief(ctx, base);

  const system = [
    "당신은 대한민국 공직자 징계·공익신고 사건에서 20년 동안 변호·자문해 온",
    "법률 컨설턴트이자 청렴 위기관리 전문가입니다.",
    "",
    "역할:",
    "1) 사용자가 제공한 '구체 상황' 과 '규칙 엔진 결과' 를 바탕으로,",
    "   실제 판례·징계 통계에 부합하는 예상 처분 분포를 제시한다.",
    "2) '무엇을 할 것인가' 가 아니라 '무엇을 즉시 하고, 하지 말 것인가' 를",
    "   액션 플랜으로 돌려준다.",
    "3) 공익신고자 보호 규정은 '법 조문' 이 아니라 '실제 이렇게 해서 보호받았다' 는",
    "   판례형 플레이북으로 제공한다.",
    "",
    "제약:",
    "· 조문에 없는 수치는 만들지 않는다.",
    "· 예상 처분은 실제 유사 사례의 감봉·정직·해임 비율을 반영한 확률 분포로.",
    "· 한국 공직 환경 특유의 '표적 감사', '왕따', '인사 보복' 같은 현실 문제를 회피하지 말 것.",
    "· 결과는 오직 JSON 으로 반환한다.",
  ].join("\n");

  const evLine = (ctx.evidence ?? []).map((e) => `    · ${e}`).join("\n");
  const articleLines = relatedArticles
    .slice(0, 3)
    .map(
      (a) =>
        `  ▸ 제${a.no}${a.sub ? "의" + a.sub : ""}조 ${a.title}\n    ${a.content.replace(/\s+/g, " ").slice(0, 400)}`
    )
    .join("\n\n");

  const user = [
    `## 구체 상황`,
    ctx.situation,
    ``,
    `## 컨텍스트`,
    `- 직무 유형: ${ctx.role ?? "미기재"}`,
    `- 관계: ${ctx.relation ?? "미기재"}`,
    `- 반복성: ${ctx.frequency ?? "unknown"}`,
    `- 현재 단계: ${ctx.currentStage ?? "before"}`,
    `- 내부 신고: ${ctx.reported ? "완료" : "미실시"}`,
    `- 보유 증거:`,
    evLine || "    · (기재 없음)",
    ``,
    `## 규칙 엔진 선행 분석`,
    `- 리스크: ${base.riskScore}% (${base.riskLevel})`,
    `- 근거: ${base.citations.map((c) => c.statute + " · " + c.clause).join(" / ") || "(없음)"}`,
    ``,
    `## 법령 API 조문 원문`,
    articleLines || "(조문 조회 실패)",
    ``,
    `## 과제`,
    `${ctx.mode === "active-admin"
      ? "적극행정 면책 적용 가능성을 중심으로 분석하되, 보호 전략까지 포함하라."
      : "방어 전략 중심으로 분석. 예상 처분 분포·증거 체크리스트·공익신고자 보호 플레이북·보복 방어책·24/72/7d 액션 타임라인을 반드시 제시하라."}`,
  ].join("\n");

  const schema: DefenseBrief = {
    situationSummary: "상황 3-4문장 요약",
    predictedDiscipline: [
      { type: "견책", probability: 20, reasoning: "근거 문장" },
      { type: "감봉", probability: 30, reasoning: "근거 문장" },
      { type: "정직", probability: 35, reasoning: "근거 문장" },
      { type: "강등", probability: 10, reasoning: "근거 문장" },
      { type: "해임", probability: 5, reasoning: "근거 문장" },
    ],
    evidenceChecklist: [
      { action: "카톡 대화 원본 PDF 보존", why: "디지털 포렌식 대응", priority: "high" },
    ],
    languageCautions: [
      {
        situation: "조사관 첫 면담",
        dont: "\"다들 그렇게 하길래\" 와 같은 일반화 발언",
        do: "\"정확한 사실관계는 서면으로 답변드리겠습니다\"",
      },
    ],
    whistleblowerPlaybook: [
      {
        step: "1. 국민권익위원회에 공익신고 접수",
        detail: "신고 접수 즉시 신분보장 적용 (부패방지권익위법 제62조)",
        lawRef: "부패방지권익위법 제62조",
      },
    ],
    retaliationDefense: [
      {
        risk: "표적 감사 (동일 업무에 반복적 서면 요구)",
        countermeasure: "모든 감사 요청을 이메일·공문으로 문서화 요청, 구두 지시 거부",
      },
    ],
    timeline: [
      { window: "24h", actions: ["증거 보존", "가족·변호인 통지"] },
      { window: "72h", actions: ["서면 소명서 작성", "내부 감사부서 접수"] },
      { window: "7d", actions: ["공익신고 접수 검토", "노조·고충위 연락"] },
    ],
    activeAdminImmunity:
      ctx.mode === "active-admin"
        ? {
            applicable: true,
            confidence: "medium",
            rationale: "고의·중과실 없음, 공공 이익 목적 확인",
            requiredDocs: ["결재 시 적극행정 적용 의사 명시", "사전 컨설팅 의견서"],
          }
        : undefined,
    redLine: "가장 중요한 한 문장 경고",
    engine: "gemini",
  };

  const out = await callJson<DefenseBrief>({
    system,
    user,
    schemaExample: schema,
    temperature: 0.25,
    maxOutputTokens: 2600,
  });

  if (!out) return fallbackDefenseBrief(ctx, base);

  // 확률 normalize (합 100)
  const totProb = out.predictedDiscipline.reduce(
    (s, p) => s + (Number(p.probability) || 0),
    0
  );
  const normalizedDisc = out.predictedDiscipline.map((p) => ({
    ...p,
    probability: totProb > 0 ? Math.round((p.probability / totProb) * 100) : 0,
  }));

  return { ...out, predictedDiscipline: normalizedDisc, engine: "gemini" };
}

function fallbackDefenseBrief(ctx: DeepContext, base: RiskAnalysis): DefenseBrief {
  const active = ctx.mode === "active-admin";
  return {
    situationSummary: `${base.prompt.slice(0, 120)}… — 리스크 ${base.riskScore}% (${base.riskLevel})`,
    predictedDiscipline: active
      ? [
          { type: "면책", probability: 55, reasoning: "고의·중과실 없음 기준" },
          { type: "처분없음", probability: 30, reasoning: "사전 컨설팅 경유 시" },
          { type: "견책", probability: 10, reasoning: "기록 미흡 시" },
          { type: "감봉", probability: 5, reasoning: "사후 소명 부족 시" },
        ]
      : base.riskScore >= 70
        ? [
            { type: "정직", probability: 40, reasoning: "직무관련성·반복성 인정 시" },
            { type: "해임", probability: 30, reasoning: "고액·장기 반복 시" },
            { type: "감봉", probability: 20, reasoning: "초범·소액 시" },
            { type: "견책", probability: 10, reasoning: "자진 신고 시" },
          ]
        : [
            { type: "견책", probability: 45, reasoning: "초기 시정 시" },
            { type: "감봉", probability: 30, reasoning: "결과 미흡 시" },
            { type: "처분없음", probability: 25, reasoning: "자진 보고 시" },
          ],
    evidenceChecklist: [
      {
        action: "관련 카톡·이메일·문서의 원본을 PDF·스크린샷으로 즉시 보존",
        why: "감사 단계에서 삭제 시도 자체가 가중 처벌 사유가 됨",
        priority: "high",
      },
      {
        action: "일시·장소·대화 상대를 시간 순으로 메모",
        why: "공무원 자신의 기억을 '증거' 로 변환하는 가장 확실한 방법",
        priority: "high",
      },
      {
        action: "결재 라인·관여 인원 목록화",
        why: "지시 체계를 증명해 '단독 책임' 프레임을 깨는 핵심",
        priority: "medium",
      },
    ],
    languageCautions: [
      {
        situation: "조사관 첫 면담",
        dont: "\"다들 그렇게 하던데요\", \"관행이라 그랬습니다\"",
        do: "\"정확한 사실관계는 서면으로 제출하겠습니다\"",
      },
      {
        situation: "동료·상급자와의 대화",
        dont: "사건에 대한 본인 의견을 SNS·카톡 단체방에 쓰는 것",
        do: "사건과 무관한 업무 대화만. 모든 사건 관련 대화는 문서화",
      },
    ],
    whistleblowerPlaybook: [
      {
        step: "1. 국민권익위원회 청렴포털에 공익신고 접수",
        detail: "접수 즉시 신분보장 조치가 발동 (신고자 이름 비공개, 인사 보복 금지)",
        lawRef: "부패방지권익위법 제62조·제66조",
      },
      {
        step: "2. 신고 사실을 외부 독립인 1인에게 통지",
        detail: "가족·변호사·외부 전문가 등. '내가 신고했다' 는 사실을 알고 있는 제3자가 있어야 보복 시 입증이 쉬움",
        lawRef: "공익신고자 보호법 제2조",
      },
      {
        step: "3. 이후 모든 업무 지시·평가를 서면 요청으로 전환",
        detail: "구두 지시 거부는 합법. '서면으로 요청해 주시면 이행하겠습니다' 로 응답",
      },
    ],
    retaliationDefense: [
      {
        risk: "표적 감사 (동일 업무에 반복 서면 요구)",
        countermeasure: "모든 감사 요청을 공식 문서(공문·이메일)로 기록 요구",
      },
      {
        risk: "부서 내 고립·따돌림",
        countermeasure: "고충처리위원회 + 노조에 동시 접수. 공익신고자 보호 조항 원용",
      },
      {
        risk: "근평·인사 불이익",
        countermeasure: "신고 이전 2년치 근평 사본 확보. 이후 현저한 하락은 보복 증거",
      },
    ],
    timeline: [
      {
        window: "24h",
        actions: [
          "모든 증거 원본 PDF/스크린샷으로 별도 저장소에 백업",
          "가족·변호사·외부 1인에게 상황 공유",
          "SNS·단체방 대화 즉시 중단",
        ],
      },
      {
        window: "72h",
        actions: [
          "사실관계 타임라인 서면 초안 작성",
          "국민권익위 청렴포털 또는 내부 감사부서에 신고 접수 여부 결정",
          "행동강령 제4조에 따른 서면 이의제기(부당지시일 경우)",
        ],
      },
      {
        window: "7d",
        actions: [
          "공인노무사·변호사 자문 (초기 30분 무료 상담 가능 기관 활용)",
          "보복 징후 모니터링(근평·업무 재배치·동료 반응) 체크리스트화",
          "필요 시 병가/연가로 회복 시간 확보",
        ],
      },
      {
        window: "30d",
        actions: [
          "공익신고자 보호위원회에 보호 신청서 제출",
          "언론 제보 여부는 신중 — 공익성 판례 기준 충족 시에만",
        ],
      },
    ],
    activeAdminImmunity: active
      ? {
          applicable: true,
          confidence: "medium",
          rationale:
            "기재된 상황에 고의·중과실 징후가 없고 공공 이익 목적이 확인되면 공공감사에 관한 법률 제23조의2에 따라 면책 가능",
          requiredDocs: [
            "결재 시 적극행정 적용 의사 문서 (결재문 내 명시)",
            "사전컨설팅 감사 의견서",
            "실시간 결정 기록 (문자·메신저 타임스탬프)",
          ],
        }
      : undefined,
    redLine:
      "증거 삭제와 SNS 해명은 가장 큰 자기 파괴. 조용히 기록하고 조용히 전문가와 상의하세요.",
    engine: "fallback",
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  7. 공용 헬퍼
 * ══════════════════════════════════════════════════════════════════════ */

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function dedupCitations(arr: RiskCitation[]): RiskCitation[] {
  const seen = new Set<string>();
  const out: RiskCitation[] = [];
  for (const c of arr) {
    const k = `${c.statute}|${c.clause}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════
 *  8. Export 관련 타입 re-export (소비측 편의)
 * ══════════════════════════════════════════════════════════════════════ */

export type { LawArticle, LawSearchItem };
