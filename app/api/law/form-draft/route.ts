import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  formName: z.string().min(2).max(100),
  context: z.string().min(10).max(3000),
  today: z.string().max(30),
});

const SYSTEM_PROMPT = [
  "당신은 대한민국 공직자 법률 전문가이자 공문서 작성 전문가입니다.",
  "아래 대화 내용을 바탕으로 공문서 서식 초안을 정확히 작성하세요.",
  "출력 규칙:",
  "- 마크다운 기호(**, ##, -, •, *, `) 절대 사용 금지.",
  "- 빈칸은 반드시 __ 로 표시하여 사용자가 직접 채울 수 있게 하세요.",
  "- 양식 이외의 설명·부연·추가 문구 절대 금지.",
  "- 아는 정보(날짜·금액·내용 등)는 대화에서 추출해 자동 채움. 모르는 것만 __ 처리.",
  "",
  "출력 형식 — 반드시 아래 구조를 정확히 따를 것:",
  "",
  "─────────────────────────────────────────",
  "{서식명}",
  "─────────────────────────────────────────",
  "작성일: {오늘날짜}",
  "",
  "신고인: __ (직위: __)",
  "소속기관: __",
  "연락처: __",
  "",
  "신고 내용:",
  "[대화 내용 기반으로 구체적·간결하게 자동 작성. 날짜·금액·인물 등 미확인 정보는 __ 처리]",
  "",
  "관련 법령: [해당 조항 명시. 예: 청탁금지법 제8조 제1항]",
  "",
  "위와 같이 신고합니다.",
  "{오늘날짜}",
  "",
  "신고인: __ (서명)",
  "",
  "수신: [담당 기관명 — 국민권익위원회 / 소속기관장 / 감사원 등 서식에 맞게]",
  "─────────────────────────────────────────",
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

  const { formName, context, today } = parsed.data;

  const userMsg = `서식명: ${formName}\n오늘날짜: ${today}\n\n[대화 내용]\n${context.slice(0, 2400)}`;

  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
      temperature: 0.2,
      maxOutputTokens: 900,
    });

    if (!txt) {
      return NextResponse.json({ ok: false, error: "GEMINI_EMPTY" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, draft: txt.trim() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
