import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";

export const runtime = "nodejs";

const BodySchema = z.object({
  prompt: z.string().min(2).max(2000),
});

/** 자연어 → 법령 키워드 전처리 */
function preprocessToLegalKeywords(text: string): string {
  const rules: [RegExp, string][] = [
    [/명절|떡값|추석|설날|선물/, "청탁금지법 금품수수 제8조"],
    [/상품권|유가증권/, "청탁금지법 제8조 선물 제외 금품"],
    [/식사|밥|점심|저녁|접대/, "청탁금지법 제8조 식사 3만원 기준"],
    [/부당.{0,6}지시|상사.{0,6}(지시|명령)/, "국가공무원법 복종의무 제57조 위반"],
    [/배우자|가족|친척.{0,6}(회사|업체|계약)/, "이해충돌방지법 사적이해관계 제5조"],
    [/갑질|폭언|욕설|괴롭힘/, "근로기준법 직장 내 괴롭힘 제76조의2"],
    [/면책|적극행정/, "적극행정 운영규정 감사원법 제23조의2"],
    [/재취업|퇴직 후.*취업/, "공직자윤리법 취업제한 제17조"],
    [/공익신고|내부고발/, "공익신고자 보호법"],
    [/이해충돌|직무.{0,4}관련/, "이해충돌방지법"],
    [/청탁|부탁|편의/, "청탁금지법 제5조 부정청탁"],
  ];

  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      return `${replacement} | 상황: ${text.slice(0, 180)}`;
    }
  }
  return text.slice(0, 200);
}

const SYSTEM_PROMPT = [
  "당신은 대한민국 공직자 청렴 전문 법률 AI입니다.",
  "사용자는 항상 공직자 또는 공공기관 종사자입니다.",
  "아래 상황과 관련된 실제 처분 사례를 3건 찾아줘.",
  "없으면 유사 처분 사례로 대체해. 절대 '판례 없음'이라고 쓰지 마.",
  "대법원 판례가 없으면 국민권익위 심의결정례, 감사원 처분례, 인사혁신처 징계사례로 대체해.",
  "",
  "[출력 형식 — 반드시 이 순서, 이 형식만 사용]",
  "",
  "[판례1]",
  "출처: 대법원 / 국민권익위 / 감사원 / 인사혁신처 중 정확히 하나",
  "번호: 사건번호 또는 결정번호 (예: 대법 2022두12345 / 권익위 2023-결정-0456)",
  "연도: YYYY",
  "핵심 사실관계: (2줄 이내, 상황과 유사한 실제 사례 요약)",
  "처분 결과: (징계수위·벌금·과태료·주의·시정명령 등 구체적으로)",
  "적용 이유: (이 사건이 현재 상황에 적용되는 핵심 이유 1줄)",
  "",
  "[판례2]",
  "출처: ...",
  "번호: ...",
  "연도: ...",
  "핵심 사실관계: ...",
  "처분 결과: ...",
  "적용 이유: ...",
  "",
  "[판례3]",
  "출처: ...",
  "번호: ...",
  "연도: ...",
  "핵심 사실관계: ...",
  "처분 결과: ...",
  "적용 이유: ...",
  "",
  "[유권해석]",
  "번호: 권익위 YYYY-법령해석-NNNN 형태로 작성",
  "요지: (이 상황에 적용되는 유권해석 핵심 1줄)",
  "",
  "마크다운 기호(**, ##, -, •) 절대 사용 금지.",
  "사건번호/결정번호가 불확실하면 유사 번호 형태로 작성하되 [추정] 표시 추가.",
].join("\n");

type PrecedentAIItem = {
  source: "대법원" | "국민권익위" | "감사원" | "인사혁신처";
  caseNo: string;
  year: string;
  facts: string;
  disposition: string;
  relevance: string;
};

type InterpretationItem = {
  ref: string;
  summary: string;
};

function parsePrecedentAI(text: string): {
  items: PrecedentAIItem[];
  interpretation: InterpretationItem | null;
} {
  const items: PrecedentAIItem[] = [];

  for (let i = 1; i <= 3; i++) {
    const startTag = `[판례${i}]`;
    const endTag = i < 3 ? `[판례${i + 1}]` : "[유권해석]";
    const start = text.indexOf(startTag);
    if (start === -1) continue;
    const end = text.indexOf(endTag);
    const block = text.slice(start + startTag.length, end !== -1 ? end : undefined).trim();

    const get = (key: string) => {
      const re = new RegExp(`${key}:\\s*(.+)`);
      return block.match(re)?.[1]?.trim() ?? "";
    };

    const rawSource = get("출처");
    const source: PrecedentAIItem["source"] =
      rawSource.includes("권익위") || rawSource.includes("국민권익위")
        ? "국민권익위"
        : rawSource.includes("감사원")
        ? "감사원"
        : rawSource.includes("인사혁신처")
        ? "인사혁신처"
        : "대법원";

    const factsMatch = block.match(/핵심 사실관계:\s*([\s\S]+?)(?=처분 결과:|$)/);
    const facts = factsMatch?.[1]?.trim().replace(/\n+/g, " ") ?? "";

    items.push({
      source,
      caseNo: get("번호"),
      year: get("연도"),
      facts: facts.slice(0, 200),
      disposition: get("처분 결과"),
      relevance: get("적용 이유"),
    });
  }

  const interpStart = text.indexOf("[유권해석]");
  let interpretation: InterpretationItem | null = null;
  if (interpStart !== -1) {
    const block = text.slice(interpStart + "[유권해석]".length).trim();
    const ref = block.match(/번호:\s*(.+)/)?.[1]?.trim() ?? "";
    const summary = block.match(/요지:\s*(.+)/)?.[1]?.trim() ?? "";
    if (ref || summary) {
      interpretation = { ref, summary };
    }
  }

  return { items: items.filter((it) => it.caseNo || it.facts), interpretation };
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
  const keywords = preprocessToLegalKeywords(prompt);

  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `상황: ${keywords}` }],
      temperature: 0.2,
      maxOutputTokens: 1000,
    });

    if (!txt) {
      return NextResponse.json({ ok: false, error: "GEMINI_EMPTY" }, { status: 502 });
    }

    const { items, interpretation } = parsePrecedentAI(txt);
    return NextResponse.json({ ok: true, items, interpretation, raw: txt });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    );
  }
}
