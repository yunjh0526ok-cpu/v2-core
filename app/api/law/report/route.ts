import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

const ConversationSchema = z.object({
  question: z.string().max(600),
  answer: z.string().max(1200),
  riskScore: z.number().optional(),
  riskLevel: z.string().optional(),
  citations: z
    .array(z.object({ statute: z.string(), clause: z.string() }))
    .optional(),
});

const BodySchema = z.object({
  conversations: z.array(ConversationSchema).min(1).max(20),
  orgType: z.string().max(50).optional(),
  position: z.string().max(30).optional(),
  today: z.string().max(40),
  generatedForms: z.array(z.string().max(60)).optional(),
});

const SYSTEM_PROMPT = [
  "당신은 대한민국 공직자 법률 전문가이자 보고서 작성 전문가입니다.",
  "아래 전체 상담 내용을 분석하여 리포트 1장으로 간결하게 요약하세요.",
  "출력 규칙:",
  "- 마크다운 기호(**, ##, -, •, *, `) 절대 사용 금지.",
  "- 섹션 외 추가 설명·부연 절대 금지.",
  "- 모든 수치(리스크%, 법령명)는 실제 상담 내용에서 추출.",
  "- 판정은 ❌위반 / ✅합법 / ⚠주의 중 가장 적합한 것 1개 선택.",
  "- Q 요약은 10자 이내로.",
  "- 반드시 아래 형식 그대로 출력 (한 줄도 빠짐없이).",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "       LexGuard AI 법률 상담 리포트",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "상담 일시: {today}",
  "기관 유형: {orgType}",
  "직위: {position}",
  "",
  "[종합 리스크 판정]",
  "주요 이슈: {핵심 법령 위반 내용 1줄}",
  "최고 리스크: XX% ({법령명})",
  "종합 판정: {❌위반 / ✅합법 / ⚠주의 중 택1}",
  "",
  "[상담 내용 요약]",
  "Q1. {질문 핵심 10자 이내} → {리스크XX% / 판정 1줄}",
  "Q2. {질문 핵심 10자 이내} → {리스크XX% / 판정 1줄}",
  "(상담 수만큼 계속)",
  "",
  "[핵심 조치 사항]",
  "① {가장 중요한 즉시 조치 1줄}",
  "② {두 번째 조치}",
  "③ {세 번째 조치}",
  "",
  "[관련 법령]",
  "{상담 전반에 언급된 법령 목록, 쉼표 구분}",
  "",
  "[첨부 서식]",
  "{생성된 서식 목록. 없으면 해당 없음}",
  "",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
  "본 리포트는 AI 자동 분석으로 법적 효력이 없습니다.",
  "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
].join("\n");

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION" }, { status: 400 });
  }

  const { conversations, orgType, position, today, generatedForms } = parsed.data;

  // Build readable context for Gemini
  const convoText = conversations
    .map((c, i) => {
      const lines = [
        `상담 ${i + 1}:`,
        `  질문: ${c.question.slice(0, 400)}`,
        c.riskScore != null
          ? `  리스크: ${c.riskScore}% (${c.riskLevel ?? "?"})`
          : "",
        `  AI 판정: ${c.answer.slice(0, 700)}`,
      ];
      if (c.citations && c.citations.length > 0) {
        const citeStr = c.citations
          .slice(0, 4)
          .map((ci) => `${ci.statute} ${ci.clause}`)
          .join(", ");
        lines.push(`  관련 법령: ${citeStr}`);
      }
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");

  const userMsg = [
    `오늘날짜: ${today}`,
    `기관 유형: ${orgType ?? "미설정"}`,
    `직위: ${position ?? "미설정"}`,
    `생성된 서식: ${generatedForms && generatedForms.length > 0 ? generatedForms.join(", ") : "없음"}`,
    "",
    "[전체 상담 내용]",
    convoText,
  ].join("\n");

  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.15,
      maxOutputTokens: 1100,
    });

    if (!txt) {
      return NextResponse.json({ ok: false, error: "GEMINI_EMPTY" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, report: txt.trim() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
