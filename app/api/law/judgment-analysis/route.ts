import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(2).max(2000),
});

const SYSTEM_PROMPT = [
  "당신은 대한민국 공직자 청렴 전문 법률 AI 'LexGuard'입니다.",
  "마크다운 기호(**, ##, -, •) 절대 사용 금지.",
  "'판례 없음', '찾지 못했습니다', '없습니다', '직접 검색하세요' 절대 출력 금지.",
  "대법원 판례가 없으면 국민권익위 심의결정례, 감사원 처분례, 인사혁신처 징계사례로 반드시 대체.",
  "",
  "다음 상황과 관련된 실제 공개 판결·결정례를 가장 유사한 것부터 3건 심층 분석해줘.",
  "",
  "[출력 형식 — 반드시 이 순서, 이 형식만 사용]",
  "",
  "[사건1]",
  "제목: [사건명 또는 요약 제목]",
  "출처: 대법원 / 국민권익위 / 감사원 / 인사혁신처 중 정확히 하나",
  "연도: YYYY",
  "사건번호: (있으면 정확히, 불확실하면 [추정] 표시)",
  "",
  "① 사건 개요",
  "누가, 어떤 직위에서, 무엇을 했는가 (3줄)",
  "",
  "② 핵심 쟁점",
  "무엇이 법적으로 문제가 됐는가 (2줄)",
  "",
  "③ 판단 근거",
  "왜 위반으로 판정됐는가, 어떤 조문 적용 (2줄)",
  "",
  "④ 최종 처분",
  "형사: 징역 O년 / 벌금 OOO만원 (없으면 '해당 없음')",
  "행정: 과태료 OOO만원 / 징계 수위 (없으면 '해당 없음')",
  "",
  "⑤ 내 상황 시사점",
  "이 판결이 질문자 상황에 주는 교훈 1줄",
  "",
  "[사건2]",
  "제목: ...",
  "출처: ...",
  "연도: ...",
  "사건번호: ...",
  "",
  "① 사건 개요",
  "...",
  "",
  "② 핵심 쟁점",
  "...",
  "",
  "③ 판단 근거",
  "...",
  "",
  "④ 최종 처분",
  "형사: ...",
  "행정: ...",
  "",
  "⑤ 내 상황 시사점",
  "...",
  "",
  "[사건3]",
  "제목: ...",
  "출처: ...",
  "연도: ...",
  "사건번호: ...",
  "",
  "① 사건 개요",
  "...",
  "",
  "② 핵심 쟁점",
  "...",
  "",
  "③ 판단 근거",
  "...",
  "",
  "④ 최종 처분",
  "형사: ...",
  "행정: ...",
  "",
  "⑤ 내 상황 시사점",
  "...",
].join("\n");

export type JudgmentCase = {
  title: string;
  source: "대법원" | "국민권익위" | "감사원" | "인사혁신처";
  year: string;
  caseNo: string;
  overview: string;
  issue: string;
  reasoning: string;
  criminalDisposition: string;
  adminDisposition: string;
  implication: string;
};

function parseJudgmentCases(text: string): JudgmentCase[] {
  const results: JudgmentCase[] = [];

  for (let i = 1; i <= 3; i++) {
    const startTag = `[사건${i}]`;
    const endTag = i < 3 ? `[사건${i + 1}]` : undefined;
    const start = text.indexOf(startTag);
    if (start === -1) continue;

    const end = endTag ? text.indexOf(endTag) : undefined;
    const block = text
      .slice(start + startTag.length, end !== undefined && end !== -1 ? end : undefined)
      .trim();

    const getLine = (key: string) => {
      const re = new RegExp(`^${key}[：:]\\s*(.+)`, "m");
      return block.match(re)?.[1]?.trim() ?? "";
    };

    const getSection = (marker: string, nextMarker?: string) => {
      const s = block.indexOf(marker);
      if (s === -1) return "";
      const e = nextMarker ? block.indexOf(nextMarker) : -1;
      return block
        .slice(s + marker.length, e !== -1 ? e : undefined)
        .trim()
        .replace(/\n+/g, " ");
    };

    const rawSource = getLine("출처");
    const source: JudgmentCase["source"] =
      rawSource.includes("권익위") || rawSource.includes("국민권익위")
        ? "국민권익위"
        : rawSource.includes("감사원")
        ? "감사원"
        : rawSource.includes("인사혁신처")
        ? "인사혁신처"
        : "대법원";

    // 최종 처분: 형사/행정 각각 추출
    const criminalMatch = block.match(/형사[:：]\s*(.+)/);
    const adminMatch = block.match(/행정[:：]\s*(.+)/);

    results.push({
      title: getLine("제목"),
      source,
      year: getLine("연도"),
      caseNo: getLine("사건번호"),
      overview: getSection("① 사건 개요", "② 핵심 쟁점"),
      issue: getSection("② 핵심 쟁점", "③ 판단 근거"),
      reasoning: getSection("③ 판단 근거", "④ 최종 처분"),
      criminalDisposition: criminalMatch?.[1]?.trim() ?? "",
      adminDisposition: adminMatch?.[1]?.trim() ?? "",
      implication: getSection("⑤ 내 상황 시사점"),
    });
  }

  return results.filter((c) => c.title || c.overview);
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
    return NextResponse.json({ ok: false, error: "VALIDATION" }, { status: 400 });
  }

  const { prompt } = parsed.data;

  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `상황: ${prompt.slice(0, 400)}` }],
      temperature: 0.2,
      maxOutputTokens: 2000,
    });

    if (!txt) {
      return NextResponse.json({ ok: false, error: "GEMINI_EMPTY" }, { status: 502 });
    }

    const cases = parseJudgmentCases(txt);
    return NextResponse.json({ ok: true, cases, raw: txt });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
