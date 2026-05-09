import { NextResponse } from "next/server";
import { z } from "zod";
import { callText, type ChatMessage } from "@/lib/gemini";
import {
  runComprehensiveLegalEnrichment,
  shouldRunComprehensiveLegalEnrichment,
} from "@/lib/comprehensiveLegalEnrichment";
import { analyzeRisk } from "@/lib/law-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── in-memory rate limiter (분당 20회 / IP) ───────────── */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const LIMIT = 20;
const WINDOW_MS = 60_000;

function getIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}
function checkLimit(ip: string) {
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

/* ── 요청 스키마 ─────────────────────────────────────── */
const BodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(20)
    .optional(),
  // 브라우저에서 직접 law.go.kr 호출 결과를 전달 — 서버 IP 우회용
  clientCitations: z
    .array(
      z.object({
        statute: z.string().max(200),
        clause: z.string().max(400),
        excerpt: z.string().max(400),
      })
    )
    .max(5)
    .optional(),
});

/* ── 법령 관련 키워드 감지 ─────────────────────────────
 *  하나라도 포함되면 Legal-Guide 분석을 병행해 근거 조문을 함께 제시한다.
 */
const LEGAL_KEYWORDS = [
  // 법령 / 용어
  "법",
  "법령",
  "조문",
  "조항",
  "판례",
  "판결",
  "소송",
  "위반",
  "처분",
  "고발",
  "신고",
  // 청탁 / 금품
  "청탁",
  "청탁금지",
  "김영란",
  "금품",
  "향응",
  "뇌물",
  "선물",
  "상품권",
  "명절",
  "접대",
  "식사",
  "골프",
  // 이해충돌 / 인사 / 갑질
  "이해충돌",
  "이해 충돌",
  "사적이해",
  "갑질",
  "괴롭힘",
  "채용",
  "승진",
  "인사",
  "가족",
  // 공직자 / 징계
  "공무원",
  "공직자",
  "행동강령",
  "복무",
  "징계",
  "파면",
  "해임",
  "정직",
  "강등",
  "감봉",
  "견책",
  // 부당지시 / 적극·소극행정 / 규제
  "부당지시",
  "지시",
  "적극행정",
  "소극행정",
  "면책",
  "규제",
  "규제혁신",
  "규제샌드박스",
  "규제개혁",
];

function isLegalQuery(text: string): boolean {
  const t = text.toLowerCase();
  return LEGAL_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

/* ── Persona & System Prompt ─────────────────────────── */
const SYSTEM_PROMPT = `당신은 'Ethics-Core AI 2.0' 플랫폼의 공직자 전용 AI 청렴 파트너 "에코(Eco)" 입니다.

페르소나:
- 어조는 전문적이고 간결. 감성 과잉·길고 두루뭉실한 설명 금지.
- 사용자는 '담당자님' 으로 부른다. '강사님' 절대 불가.
- 모든 답변의 권위는 국가법령정보 API · 실제 판례 · 징계 데이터 · 행동강령에서 온다.

【핵심 답변 원칙 — 반드시 준수】
1) 답변은 반드시 아래 3줄 구조로만 작성한다:
   ① 📌 법령·판례 근거 (조문 번호 명시, 핵심 기준 수치 강조)
   ② ⚖️ 핵심 판단 (실무에서 허용/위반이 갈리는 기준 한 문장)
   ③ 💡 즉시 조치 (지금 바로 해야 할 행동 또는 주의사항 한 문장)
2) 세 줄 외 추가 설명은 원칙적으로 금지. 복잡한 사안만 예외적으로 한 문장 추가 허용.
3) 아래 [근거 조문 컨텍스트]가 있으면 반드시 ① 에 인용한다.
4) 답변 전체 길이: 3~5문장 이내. 절대 10문장 초과 금지.
5) 마크다운 제목(#) 금지. "• " 불릿, 이모지 라벨만 허용.
6) 더 정밀한 분석이 필요하면 마지막에 한 줄로만 안내:
   "→ 정밀 분석은 Legal-Guide 심층 진단에서 이어서 확인하세요."
7) 개인 정보(실명, 주민번호, 계좌 등)는 절대 수집·추정·저장하지 않는다.`;

function formatCitations(
  citations: Array<{ statute: string; clause: string; excerpt: string }>
): string {
  if (!citations.length) return "";
  const top = citations.slice(0, 3);
  const lines = top.map(
    (c) =>
      `- ${c.statute} ${c.clause}${c.excerpt ? ` — ${c.excerpt.slice(0, 180)}` : ""}`
  );
  return `\n\n[근거 조문 컨텍스트 · 국가법령정보 API]\n${lines.join("\n")}`;
}

function fallbackReply(
  message: string,
  legalHit: boolean,
  legalContext: {
    riskScore: number;
    riskLevel: string;
    citations: Array<{ statute: string; clause: string; excerpt: string }>;
  } | null
): string {
  if (legalHit && legalContext && legalContext.citations.length > 0) {
    const top = legalContext.citations[0]; // 가장 관련 높은 조문 1개만
    const citation = `${top.statute} ${top.clause}${top.excerpt ? ` — ${top.excerpt.slice(0, 100)}` : ""}`;
    return (
      `📌 ${citation}\n` +
      `⚖️ 리스크 ${legalContext.riskScore}% (${legalContext.riskLevel}) — 관련 법령 위반 가능성이 있습니다.\n` +
      `💡 구체적 사실관계는 Legal-Guide 심층 진단에서 정밀 분석하세요.`
    );
  }

  return (
    `📌 "${message.slice(0, 80)}${message.length > 80 ? "…" : ""}" — 국가법령정보 API 매칭 대기 중입니다.\n` +
    `⚖️ 정확한 법령 근거 확인이 필요합니다.\n` +
    `💡 → Legal-Guide 심층 진단에서 즉시 조문·판례·리스크%를 확인하세요.`
  );
}

/* ── POST /api/eco/chat ──────────────────────────────── */
export async function POST(req: Request) {
  const ip = getIp(req);
  const rl = checkLimit(ip);
  if (!rl.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "RATE_LIMITED",
        message: `짧은 시간에 너무 많은 질문이 들어왔습니다. 잠시 후 다시 시도해 주세요.`,
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
        error: "INVALID_BODY",
        details: parsed.error.issues.map((i) => i.message),
      },
      { status: 400 }
    );
  }

  const { message, history, clientCitations } = parsed.data;
  const legacyLegalHit = isLegalQuery(message);
  const useComprehensive = shouldRunComprehensiveLegalEnrichment(
    message,
    legacyLegalHit
  );

  // 1) 레거시: 공직·청렴 키워드 → 기존 analyzeRisk(시나리오·리스크) 유지
  // 2) 확장: 키워드 미매칭이어도 일반 법률 질의 → 포괄 법령·판례 검색
  // 3) [클라이언트 직접 호출] clientCitations 제공 시 analyzeRisk 서버 호출 스킵
  let citationsBlock = "";
  let legalContext: {
    riskScore: number;
    riskLevel: string;
    citations: Array<{ statute: string; clause: string; excerpt: string }>;
  } | null = null;
  let enrichment: "legacy" | "comprehensive" | "client-direct" | "none" = "none";

  if (clientCitations && clientCitations.length > 0) {
    // 브라우저에서 직접 가져온 law.go.kr 인용 데이터 사용 — analyzeRisk 호출 없음
    enrichment = "client-direct";
    legalContext = { riskScore: 0, riskLevel: "LOW", citations: clientCitations };
    citationsBlock = formatCitations(clientCitations);
  } else if (legacyLegalHit) {
    enrichment = "legacy";
    try {
      const analysis = await analyzeRisk(message);
      legalContext = {
        riskScore: analysis.riskScore,
        riskLevel: analysis.riskLevel,
        citations: analysis.citations.map((c) => ({
          statute: c.statute,
          clause: c.clause,
          excerpt: c.excerpt ?? "",
        })),
      };
      citationsBlock = formatCitations(legalContext.citations);
    } catch (err) {
      console.warn("[eco/chat] legal enrichment failed:", (err as Error).message);
    }
  } else if (useComprehensive) {
    enrichment = "comprehensive";
    try {
      const { systemBlock, context } =
        await runComprehensiveLegalEnrichment(message);
      if (systemBlock) citationsBlock = `\n\n${systemBlock}`;
      legalContext = {
        riskScore: context.riskScore,
        riskLevel: context.riskLevel,
        citations: context.citations.map((c) => ({
          statute: c.statute,
          clause: c.clause,
          excerpt: c.excerpt ?? "",
        })),
      };
    } catch (err) {
      console.warn(
        "[eco/chat] comprehensive enrichment failed:",
        (err as Error).message
      );
    }
  }

  const legalHit = legacyLegalHit || useComprehensive;

  // 2) 시스템 프롬프트 + 법령 컨텍스트 합성
  const system = SYSTEM_PROMPT + (citationsBlock || "");

  // 3) 메시지 이력 구성
  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: "user", content: message },
  ];

  // 4) Gemini 호출 (폴백 포함)
  let reply: string | null = null;
  try {
    reply = await callText({
      system,
      messages,
      temperature: 0.2,   // 낮춰서 일관된 팩트 기반 답변
      maxOutputTokens: 500, // 짧고 핵심적인 답변 강제
    });
  } catch (err) {
    console.warn("[eco/chat] callText error:", (err as Error).message);
  }
  const usedFallback = !reply;
  if (!reply) reply = fallbackReply(message, legalHit, legalContext);

  return NextResponse.json({
    ok: true,
    data: {
      reply,
      legalContext,
      legalHit,
      enrichment,
    },
    meta: {
      engine: usedFallback ? "fallback" : "gemini",
      rateLimit: { remaining: rl.remaining, resetInMs: rl.resetIn },
    },
  });
}
