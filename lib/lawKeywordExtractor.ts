/**
 * lawKeywordExtractor.ts
 * Gemini 경량 호출로 질문에서 관련 법령명과 핵심 키워드를 추출한다.
 * 국가법령정보 API 조회 전 1단계로 실행된다.
 */
import { callText } from "@/lib/gemini";

export type ExtractedLaw = {
  lawName: string;
  keywords: string[];
};

const CANDIDATE_LAWS = [
  "도시및주거환경정비법",
  "청탁금지법",
  "이해충돌방지법",
  "공직자윤리법",
  "형법",
  "민사집행법",
  "행정심판법",
  "공익신고자보호법",
  "근로기준법",
  "부패방지권익위법",
];

const SYSTEM_PROMPT = [
  "다음 질문에서 관련 법령명을 추출하라. 아래 법령 목록 중 해당되는 것만 선택해라.",
  "",
  "법령 목록:",
  ...CANDIDATE_LAWS.map((l) => `- ${l}`),
  "",
  "반드시 JSON 배열로만 응답. 다른 텍스트·마크다운 절대 금지.",
  '형식: [{"lawName":"법령명","keywords":["핵심키워드1","핵심키워드2"]}]',
  "관련 법령이 없으면: []",
].join("\n");

/**
 * 질문 텍스트에서 관련 법령명·키워드 배열을 반환한다.
 * Gemini 호출 실패 시 빈 배열로 graceful fallback.
 */
export async function extractLawKeywords(
  userText: string
): Promise<ExtractedLaw[]> {
  try {
    const txt = await callText({
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `질문: ${userText.slice(0, 300)}` },
      ],
      temperature: 0.1,
      maxOutputTokens: 256,
    });
    if (!txt) return [];

    const clean = txt.replace(/```json|```/g, "").trim();
    const parsed: unknown = JSON.parse(clean);
    if (!Array.isArray(parsed)) return [];

    return (parsed as unknown[]).filter(
      (x): x is ExtractedLaw =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as Record<string, unknown>).lawName === "string" &&
        Array.isArray((x as Record<string, unknown>).keywords)
    );
  } catch {
    return [];
  }
}
