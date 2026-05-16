import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(2).max(2000),
});

const ANTI_GRAFT_AMOUNTS =
  "[필수 적용 법령 수치 — 2024년 1월 1일 개정 기준]\n" +
  "청탁금지법 음식물 5만원 / 선물 5만원 / 농수산물·가공품 15만원 / 명절 30만원 / 경조사비 5만원 / 화환·조화 10만원\n" +
  "위 수치를 기준으로 확인 질문할 것.\n";

const SYSTEM_PROMPT = [
  ANTI_GRAFT_AMOUNTS,
  "당신은 대한민국 공직자 법률 전문가입니다.",
  "사용자가 상황을 설명하면 즉시 판단하지 말고, 정확한 진단을 위해 핵심 정보 2~3가지를 질문하라.",
  "마크다운 기호(**, ##, -, •) 절대 사용 금지.",
  "",
  "질문 선택 기준 (상황에 맞는 것으로):",
  "- 금품·선물·식사 관련 → ①금액 ②직무관련성 여부 ③먼저 알았나 나중에 알았나",
  "- 지시·명령 관련 → ①문서 지시인가 구두 지시인가 ②예산·계약 관련 여부 ③직속 상급자 지시인가",
  "- 이해충돌·가족 관련 → ①가족 범위(배우자/직계?) ②계약 규모 ③본인이 결재권자인가",
  "- 갑질·폭언 관련 → ①반복 횟수 ②증거(문자·카톡 등) 여부 ③피해자가 본인 외에 더 있는가",
  "- 신고·제보 관련 → ①신고 대상이 상급자인가 ②증거 보관 여부 ③익명 원하는가",
  "",
  "반드시 아래 형식으로만 답변. 추가 설명이나 판단 금지:",
  "정확한 분석을 위해 몇 가지 확인할게요.",
  "① [첫 번째 질문]",
  "② [두 번째 질문]",
  "③ [세 번째 질문] (필요한 경우에만, 그렇지 않으면 생략)",
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

  const { prompt } = parsed.data;

  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `상황: ${prompt.slice(0, 600)}` }],
      temperature: 0.3,
      maxOutputTokens: 280,
    });

    if (!txt) {
      return NextResponse.json({ ok: false, error: "GEMINI_EMPTY" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, questions: txt.trim() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
