import { NextResponse } from "next/server";
import { z } from "zod";
import { callText } from "@/lib/gemini";
import { searchRelevantPrecedents, type RelevantPrecedent } from "@/lib/law-api";

export const runtime = "nodejs";

const BodySchema = z.object({
  situation: z.string().min(5).max(4000),
});

const FALLBACK_PRECEDENTS: RelevantPrecedent[] = [
  {
    caseNo: "2023두00000",
    court: "대법원",
    date: "2023-11-02",
    gist: "반복성·직무관련성이 인정되면 소액이라도 징계 정당성이 인정될 수 있음을 판시.",
    outcome: "패소",
    outcomeKeyword: "직무관련성 인정",
  },
  {
    caseNo: "2022두00000",
    court: "대법원",
    date: "2022-06-16",
    gist: "공익 목적·사적 이익 부재·합리적 절차 준수 여부를 종합해 감경 가능성을 인정.",
    outcome: "승소",
    outcomeKeyword: "공익 목적",
  },
  {
    caseNo: "2021두00000",
    court: "대법원",
    date: "2021-09-09",
    gist: "포상 이력, 신속한 시정, 재발방지 약속은 정상참작 요소가 될 수 있다고 판시.",
    outcome: "승소",
    outcomeKeyword: "정상참작",
  },
];

function parseSections(
  text: string,
  count: number
): Array<{ similarity: "높음" | "중간" | "낮음"; point: string }> {
  const result: Array<{ similarity: "높음" | "중간" | "낮음"; point: string }> = [];
  for (let i = 1; i <= count; i++) {
    const startMarker = `[판례 ${i}]`;
    const endMarker = i < count ? `[판례 ${i + 1}]` : "[종합";
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker);
    const section = start !== -1 ? text.slice(start, end !== -1 ? end : undefined) : "";
    const sim = section.match(/유사도:\s*(높음|중간|낮음)/)?.[1] as
      | "높음"
      | "중간"
      | "낮음"
      | undefined;
    const point = section.match(/연결 포인트:\s*(.+)/)?.[1]?.trim() ?? "";
    result.push({ similarity: sim ?? "중간", point });
  }
  return result;
}

function parseAdvice(text: string): string {
  return text.match(/\[종합 조언\]\n?([\s\S]+)/)?.[1]?.trim() ?? "";
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

  const { situation } = parsed.data;

  // 1. 판례 검색
  let precedents: RelevantPrecedent[] = [];
  try {
    precedents = await searchRelevantPrecedents(situation);
  } catch {
    /* keep empty — fallback below */
  }

  const top3 = precedents.slice(0, 3);

  // 판례 없음 → 가짜 데이터 대신 안내 메시지 반환
  if (top3.length === 0) {
    return NextResponse.json({
      ok: true,
      data: {
        items: [],
        advice: "",
        totalFound: 0,
        noResults: true,
      },
    });
  }

  // 2. Gemini 유사도·연결포인트 분석
  const precedentBlock = top3
    .map(
      (p, i) =>
        `[판례 ${i + 1}]\n사건번호: ${p.caseNo ?? "미상"} | 법원: ${p.court ?? "대법원"} | 선고: ${p.date ?? "미상"}\n결과: ${p.outcome ?? "미상"} / ${p.outcomeKeyword ?? "-"}\n요지: ${p.gist}`
    )
    .join("\n\n");

  const system = [
    "당신은 대한민국 법률 판례 분석 전문가입니다.",
    "마크다운 기호(**, ##, -, •) 절대 사용 금지.",
    "반드시 아래 형식으로만 출력하세요:",
    "",
    "[판례 1]",
    "유사도: 높음/중간/낮음 중 정확히 하나",
    "연결 포인트: 내 상황과의 연결을 1줄로 설명",
    "",
    "[판례 2]",
    "유사도: 높음/중간/낮음 중 정확히 하나",
    "연결 포인트: 내 상황과의 연결을 1줄로 설명",
    "",
    "[판례 3]",
    "유사도: 높음/중간/낮음 중 정확히 하나",
    "연결 포인트: 내 상황과의 연결을 1줄로 설명",
    "",
    "[종합 조언]",
    "판례를 종합해 실무 대응 조언 2줄",
    "",
    "유사도 기준: 높음=쟁점·행위·처분이 거의 동일 / 중간=일부 쟁점 겹침 / 낮음=참고 수준",
  ].join("\n");

  let analysisText = "";
  try {
    analysisText =
      (await callText({
        system,
        messages: [
          { role: "user", content: `내 상황: ${situation}\n\n${precedentBlock}` },
        ],
        temperature: 0.15,
        maxOutputTokens: 600,
      })) ?? "";
  } catch {
    /* keep empty — use raw precedent data */
  }

  const sections = parseSections(analysisText, 3);
  const advice = parseAdvice(analysisText);

  const items = top3.map((p, i) => ({
    caseNo: p.caseNo ?? "미상",
    court: p.court ?? "대법원",
    date: p.date ?? "",
    gist: p.gist,
    outcome: p.outcome ?? "결과 미상",
    similarity: sections[i]?.similarity ?? "중간",
    relevantPoint:
      sections[i]?.point || "관련 쟁점이 포함된 참고 판례입니다.",
  }));

  return NextResponse.json({
    ok: true,
    data: {
      items,
      advice:
        advice ||
        "관련 판례를 참고해 방어 전략을 수립하고, 필요 시 전문 법률가의 검토를 받으세요.",
      totalFound: precedents.length,
    },
  });
}
