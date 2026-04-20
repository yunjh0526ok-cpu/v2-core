/**
 * lib/chatHandoff.ts
 * ──────────────────────────────────────────────────────────────
 *  마퀴(LegalPrecedentMarquee / AdminReformMarquee) 팝업에서
 *  "Legal-Guide 챗으로 이어서 상담 계속하기" 클릭 시
 *  sessionStorage 에 분석 컨텍스트를 저장 → LegalChatbot 이 마운트 시
 *  읽어서 API 재호출 없이 즉시 이전 분석을 메시지로 주입.
 */

export const HANDOFF_KEY = "ethics_chat_handoff";

export type ChatHandoff = {
  question: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  /** 4섹션 형식([상황 진단] … [권고 조치]) narrative 전문 */
  narrative: string;
  /** 한 줄 요약 */
  summary: string;
  lawBasis: { statute: string; clause: string }[];
  recommendations: string[];
  keyIssues: string[];
};

export function saveHandoff(data: ChatHandoff): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(data));
}

export function readAndClearHandoff(): ChatHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw) as ChatHandoff;
  } catch {
    return null;
  }
}

/** PrecedentQuiz risk → 대표 점수 매핑 */
export const RISK_SCORE: Record<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL", number> = {
  LOW: 22,
  MEDIUM: 55,
  HIGH: 78,
  CRITICAL: 92,
};
