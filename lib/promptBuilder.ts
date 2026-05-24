/**
 * promptBuilder.ts
 * 국가법령정보 API 조회 결과를 Gemini 프롬프트 컨텍스트 블록으로 변환한다.
 * UI·배포 설정과 무관한 순수 유틸리티 모듈.
 */
import type { LawFetchResult } from "@/lib/lawApiClient";

export type BuiltLawContext = {
  /** Gemini system/user 프롬프트에 삽입할 법령 원문 블록 */
  contextBlock: string;
  /** 응답 하단 출처 표시용 조문 목록 */
  citations: string[];
  /** API 실제 조회 성공 여부 */
  apiSuccess: boolean;
};

/**
 * 법령 원문 + 판례 데이터를 Gemini 프롬프트용 컨텍스트 블록으로 조립한다.
 */
export function buildLawContext(
  lawResults: LawFetchResult[],
  precedents: Array<{ caseNo: string; summary: string }> = []
): BuiltLawContext {
  const hits = lawResults.filter(
    (r) => r.source === "api" && r.articles.length > 0
  );

  if (hits.length === 0 && precedents.length === 0) {
    return { contextBlock: "", citations: [], apiSuccess: false };
  }

  const lines: string[] = [];
  const citations: string[] = [];

  // ── 법령 원문 블록 ──────────────────────────────────────────────────────
  if (hits.length > 0) {
    lines.push("[실제 법령 원문 - 국가법령정보 API 조회 결과]");
    for (const r of hits) {
      lines.push(`법령명: ${r.lawName}`);
      for (const a of r.articles) {
        const artLabel = `제${a.no}조${a.title ? `(${a.title})` : ""}`;
        lines.push(`조문: ${artLabel} ${a.content}`);
        citations.push(`${r.lawName} ${artLabel}`);
      }
      lines.push("---");
    }
    lines.push(
      "위 실제 법령 원문을 반드시 근거로 삼아 분석해줘.",
      "법령 원문에 없는 내용은 추측하지 말고 '해당 법령 조문 확인 필요'로 표시해."
    );
  }

  // ── 판례 블록 ──────────────────────────────────────────────────────────
  if (precedents.length > 0) {
    lines.push("", "[관련 판례 - 국가법령정보 API 조회 결과]");
    for (const p of precedents) {
      if (p.caseNo && p.caseNo !== "사건번호 미상")
        lines.push(`사건번호: ${p.caseNo}`);
      if (p.summary) lines.push(`판시사항: ${p.summary}`);
      lines.push("---");
    }
  }

  return {
    contextBlock: lines.join("\n"),
    citations,
    apiSuccess: true,
  };
}

/**
 * 응답 하단에 표시할 법령 출처 문자열 반환.
 * API 미연동 시 경고 문자열 반환.
 */
export function formatCitationFooter(
  citations: string[],
  apiSuccess: boolean
): string {
  if (!apiSuccess || citations.length === 0) {
    return "⚠️ 법령 API 미연동 - AI 분석 기반 답변 (검증 필요)";
  }
  return `📋 근거 법령 (국가법령정보 API 조회): ${citations.join(" | ")}`;
}
