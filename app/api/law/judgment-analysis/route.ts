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
  "관련 처분 사례 3건을 심층 분석해줘.",
  "각 사건은 반드시 아래 6섹션 형식으로 출력.",
  "절대 짧게 쓰지 말 것. 각 섹션 최소 3줄.",
  "",
  "[사건1]",
  "제목: [사건명 또는 요약 제목]",
  "출처: 대법원 / 국민권익위 / 감사원 / 인사혁신처 중 정확히 하나",
  "연도: YYYY",
  "사건번호: (있으면 정확히, 불확실하면 [추정] 표시)",
  "",
  "[판결 요지]",
  "이 사건 핵심 판단 1~2문장.",
  "예) '직무관련성 없다는 주장 불인정, 명절 관례 항변 기각'",
  "",
  "[결정적 위반 행위]",
  "어떤 행위가 처벌 원인이 됐는지.",
  "금액·횟수·관계·경위 구체적으로.",
  "",
  "[당사자 변명 vs 판단]",
  "변명: 당사자가 뭐라고 했는지",
  "판단: 왜 그 변명이 기각됐는지",
  "예)",
  "변명: '관례적 선물이라 몰랐다'",
  "판단: '직무관련성은 주관적 인식과 무관, 항변 기각'",
  "",
  "[적용 법령 및 처분]",
  "법령명 §조항",
  "형사: O년 이하 징역 / O만원 이하 벌금",
  "행정: 과태료 O만원",
  "징계: 수위",
  "",
  "[처분 후 결과]",
  "직위 변화, 계약 취소 여부 등",
  "",
  "[내 상황 핵심 교훈]",
  "질문자가 반드시 기억할 것 1~2문장",
  "",
  "[사건2]",
  "제목: ...",
  "출처: ...",
  "연도: ...",
  "사건번호: ...",
  "",
  "[판결 요지]",
  "...",
  "",
  "[결정적 위반 행위]",
  "...",
  "",
  "[당사자 변명 vs 판단]",
  "변명: ...",
  "판단: ...",
  "",
  "[적용 법령 및 처분]",
  "법령명 §조항: ...",
  "형사: ...",
  "행정: ...",
  "징계: ...",
  "",
  "[처분 후 결과]",
  "...",
  "",
  "[내 상황 핵심 교훈]",
  "...",
  "",
  "[사건3]",
  "제목: ...",
  "출처: ...",
  "연도: ...",
  "사건번호: ...",
  "",
  "[판결 요지]",
  "...",
  "",
  "[결정적 위반 행위]",
  "...",
  "",
  "[당사자 변명 vs 판단]",
  "변명: ...",
  "판단: ...",
  "",
  "[적용 법령 및 처분]",
  "법령명 §조항: ...",
  "형사: ...",
  "행정: ...",
  "징계: ...",
  "",
  "[처분 후 결과]",
  "...",
  "",
  "[내 상황 핵심 교훈]",
  "...",
  "",
  "출처: 대법원/권익위/감사원/인사혁신처",
  "연도: 2021~2024 최신 우선",
  "절대 없다고 하지 말 것",
].join("\n");

export type JudgmentCase = {
  title: string;
  source: "대법원" | "국민권익위" | "감사원" | "인사혁신처";
  year: string;
  caseNo: string;
  /** [판결 요지] */
  verdict: string;
  /** [결정적 위반 행위] */
  violation: string;
  /** [당사자 변명 vs 법원·위원회 판단] */
  defense: string;
  /** [적용 법령 및 처분] — 법령·형사·행정·징계 포함 전체 텍스트 */
  disposition: string;
  /** [처분 후 결과] */
  afterResult: string;
  /** [내 상황 핵심 교훈] */
  lesson: string;
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

    /** 섹션 헤더 [TAG] 부터 다음 [nextTag] 직전까지 추출 */
    const getSectionContent = (tag: string, nextTag?: string) => {
      const s = block.indexOf(tag);
      if (s === -1) return "";
      const afterTag = s + tag.length;
      const e = nextTag ? block.indexOf(nextTag, afterTag) : -1;
      return block
        .slice(afterTag, e !== -1 ? e : undefined)
        .trim()
        .replace(/\n{3,}/g, "\n\n");
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

    results.push({
      title: getLine("제목"),
      source,
      year: getLine("연도"),
      caseNo: getLine("사건번호"),
      verdict: getSectionContent("[판결 요지]", "[결정적 위반 행위]"),
      violation: getSectionContent("[결정적 위반 행위]", "[당사자 변명"),
      defense: getSectionContent("[당사자 변명 vs 판단]", "[적용 법령"),
      disposition: getSectionContent("[적용 법령 및 처분]", "[처분 후 결과]"),
      afterResult: getSectionContent("[처분 후 결과]", "[내 상황 핵심 교훈]"),
      lesson: getSectionContent("[내 상황 핵심 교훈]"),
    });
  }

  return results.filter((c) => c.title || c.verdict);
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
      maxOutputTokens: 2800,
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
