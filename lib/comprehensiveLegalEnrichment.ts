/**
 * comprehensiveLegalEnrichment.ts
 * ───────────────────────────────────────────────────────────────────────────
 * LexGuard / 에코 챗 등에서 **카테고리(키워드) 매칭 없이** 일반 법률 질의에도
 * 국가법령정보 Open API(법령 검색 + 판례 검색)를 붙이기 위한 확장 레이어.
 *
 * - 기존 `analyzeRisk`(시나리오·리스크 엔진)는 그대로 두고, 키워드 미매칭 시에만 본 모듈을 사용한다.
 * - 법령: law.go.kr `lawSearch.do?target=law` (기존 searchLaws)
 * - 판례: law.go.kr `lawSearch.do?target=prec` — 국가 통합 법률정보(대법원 등 판례 포함)
 *
 * 모든 단계는 try/catch·빈 결과 허용으로 graceful fallback.
 */

import {
  extractLegalKeywords,
  fetchLawDetail,
  pickMostRelevantArticlePublic,
  searchLaws,
  searchPrecedents,
  type LawSearchItem,
  type PrecedentSearchItem,
} from "@/lib/law-api";

/** analyzeRisk 결과와 호환되는 최소 컨텍스트 (폴백 응답용) */
export type ComprehensiveLegalContext = {
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  citations: Array<{ statute: string; clause: string; excerpt: string }>;
};

/** 질의에서 lawSearch·판례 검색용 쿼리 문자열 생성 (키워드 추출) */
export function buildLegalApiQueriesFromUserText(userText: string): {
  lawQuery: string;
  precQuery: string;
} {
  const cleaned = userText.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!cleaned) {
    return { lawQuery: "민법", precQuery: "민법" };
  }
  const filler =
    /^(저는|저희|제가|혹시|질문입니다|문의드|여쭤|알고\s*싶|궁금합니다|도와)/i;
  let q = cleaned.replace(filler, "").trim() || cleaned;
  const stop = new Set([
    "하는데",
    "있는데",
    "경우에",
    "있을까",
    "있나요",
    "되나요",
    "될까요",
    "인가요",
    "맞나요",
  ]);
  const tokens = q
    .split(/[\s,.;，。!?？]+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(
      (w) =>
        w.length >= 2 &&
        !stop.has(w) &&
        !/^(그냥|정말|진짜|매우|너무|좀|만)$/.test(w)
    );
  const core =
    tokens.length >= 2 ? tokens.slice(0, 8).join(" ") : q.slice(0, 80).trim();
  const lawQuery = (core || "민법").slice(0, 100);
  const precQuery = `${lawQuery} ${tokens.slice(0, 3).join(" ")}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return { lawQuery, precQuery: precQuery || lawQuery };
}

/** 레거시 키워드(공직 청렴 등)에 안 걸린 서술형 법률 질의인지 판별 */
export function shouldRunComprehensiveLegalEnrichment(
  message: string,
  legacyKeywordMatched: boolean
): boolean {
  if (legacyKeywordMatched) return false;
  const t = message.trim();
  if (t.length < 12) return false;
  if (
    /^(오늘|내일|점심|저녁|아침)\b/u.test(t) &&
    !/법|소송|위반|계약|판례|징계|공무원|공직/u.test(t)
  ) {
    return false;
  }
  if (
    /추천해|뭐\s*먹지|날씨|영화|드라마|노래|운동|다이어트/u.test(t) &&
    !/법|소송|계약|판례|해지|배상/u.test(t)
  ) {
    return false;
  }
  return true;
}

function formatLawLines(items: LawSearchItem[]): string {
  if (!items.length) return "(검색 결과 없음)";
  return items
    .slice(0, 6)
    .map((l, i) => {
      const meta = [l.department, l.effectiveDate].filter(Boolean).join(" · ");
      return `${i + 1}. ${l.name}${meta ? ` — ${meta}` : ""}`;
    })
    .join("\n");
}

function formatPrecLines(items: PrecedentSearchItem[]): string {
  if (!items.length) return "(검색 결과 없음)";
  return items
    .slice(0, 4)
    .map((p, i) => {
      const head = [p.court, p.caseNo].filter(Boolean).join(" ");
      const gist = p.gist ? p.gist.slice(0, 140) : "";
      return `${i + 1}. ${head ? `${head} — ` : ""}${p.title}${gist ? ` · ${gist}${gist.length >= 140 ? "…" : ""}` : ""}`;
    })
    .join("\n");
}

/**
 * 시스템 프롬프트에 붙일 블록 + 폴백용 citations 생성.
 * 실패해도 빈 블록·LOW 컨텍스트 반환.
 */
export async function runComprehensiveLegalEnrichment(
  userText: string
): Promise<{ systemBlock: string; context: ComprehensiveLegalContext }> {
  const empty: ComprehensiveLegalContext = {
    riskScore: 22,
    riskLevel: "LOW",
    citations: [],
  };

  try {
    const { lawQuery, precQuery } = buildLegalApiQueriesFromUserText(userText);

    const [lawRes, precItems] = await Promise.all([
      searchLaws(lawQuery),
      searchPrecedents(precQuery, 6),
    ]);

    const citations: ComprehensiveLegalContext["citations"] = [];
    let articleExcerpt = "";

    const topLaw = lawRes.items[0];
    if (topLaw) {
      try {
        const detail = await fetchLawDetail(topLaw.mst ?? topLaw.id, topLaw.name);
        const best = pickMostRelevantArticlePublic(detail.articles, userText);
        if (best) {
          const clause = `제${best.no}${best.sub ? "의" + best.sub : ""}조 ${best.title}`.trim();
          const ex = best.content.replace(/\s+/g, " ").trim().slice(0, 220);
          articleExcerpt = `${detail.name} ${clause} — ${ex}${ex.length >= 220 ? "…" : ""}`;
          citations.push({
            statute: detail.name,
            clause,
            excerpt: ex,
          });
        }
      } catch {
        /* 조문 조회 실패 시 목록만 사용 */
      }
      if (!citations.length) {
        citations.push({
          statute: topLaw.name,
          clause: "법령 목록 매칭(조문은 law.go.kr에서 확인)",
          excerpt: "",
        });
      }
    }

    for (const p of precItems.slice(0, 3)) {
      if (!p.title) continue;
      citations.push({
        statute: p.court ? `${p.court} 판례` : "판례",
        clause: p.caseNo ? `${p.title} (${p.caseNo})` : p.title,
        excerpt: (p.gist ?? "").slice(0, 160),
      });
    }

    const hasBody = lawRes.items.length > 0 || precItems.length > 0;
    const context: ComprehensiveLegalContext = {
      riskScore: hasBody ? 42 : 22,
      riskLevel: hasBody ? "MEDIUM" : "LOW",
      citations: citations.slice(0, 8),
    };

    const systemBlock = `
[법령·판례 자료 — 국가법령정보센터 Open API · 법령(target=law) 및 판례(target=prec) 검색]
검색어(자동 추출): 법령「${lawQuery}」 / 판례「${precQuery}」
출처: https://www.law.go.kr (법제처 국가법령정보 공동활용)

■ 관련 법령(상위 목록)
${formatLawLines(lawRes.items)}
${articleExcerpt ? `\n■ 조문 발췌(1건)\n${articleExcerpt}\n` : ""}
■ 관련 판례(요지)
${formatPrecLines(precItems)}

【답변 지침】
• 위 목록·발췌에 없는 조문번호·판례번호·판시사항을 만들어내지 마십시오.
• ① 📌 에서 위 자료를 근거로 요약 인용하고, 부족하면 law.go.kr 원문 확인을 안내하십시오.
• 일반 법률 질의(계약·노동·민사 등)와 공직 청렴 질의를 구분 없이 동일하게 이 자료를 활용합니다.
`.trim();

    return { systemBlock, context };
  } catch (e) {
    console.warn(
      "[comprehensiveLegalEnrichment]",
      e instanceof Error ? e.message : e
    );
    return {
      systemBlock: "",
      context: empty,
    };
  }
}

/**
 * 범용 fallback enrichment — `buildLegalApiQueriesFromUserText` 대신
 * `law-api.extractLegalKeywords` 로만 쿼리를 만들어 동일 파이프라인을 수행한다.
 * 카테고리(공익신고 등) 키워드와 무관하게 일반 법률 질문에도 검색이 붙도록 한다.
 * (기존 `runComprehensiveLegalEnrichment` 는 변경하지 않음)
 */
export async function runComprehensiveLegalEnrichmentFallback(
  userText: string
): Promise<{ systemBlock: string; context: ComprehensiveLegalContext }> {
  const empty: ComprehensiveLegalContext = {
    riskScore: 22,
    riskLevel: "LOW",
    citations: [],
  };

  try {
    const { lawQuery, precQuery } = extractLegalKeywords(userText);

    let lawRes = await searchLaws(lawQuery);
    if (!lawRes.items.length && precQuery !== lawQuery) {
      lawRes = await searchLaws(precQuery);
    }
    const precItems = await searchPrecedents(precQuery, 6);

    const citations: ComprehensiveLegalContext["citations"] = [];
    let articleExcerpt = "";

    const topLaw = lawRes.items[0];
    if (topLaw) {
      try {
        const detail = await fetchLawDetail(topLaw.mst ?? topLaw.id, topLaw.name);
        const best = pickMostRelevantArticlePublic(detail.articles, userText);
        if (best) {
          const clause = `제${best.no}${best.sub ? "의" + best.sub : ""}조 ${best.title}`.trim();
          const ex = best.content.replace(/\s+/g, " ").trim().slice(0, 220);
          articleExcerpt = `${detail.name} ${clause} — ${ex}${ex.length >= 220 ? "…" : ""}`;
          citations.push({
            statute: detail.name,
            clause,
            excerpt: ex,
          });
        }
      } catch {
        /* noop */
      }
      if (!citations.length) {
        citations.push({
          statute: topLaw.name,
          clause: "법령 목록 매칭(조문은 law.go.kr에서 확인)",
          excerpt: "",
        });
      }
    }

    for (const p of precItems.slice(0, 3)) {
      if (!p.title) continue;
      citations.push({
        statute: p.court ? `${p.court} 판례` : "판례",
        clause: p.caseNo ? `${p.title} (${p.caseNo})` : p.title,
        excerpt: (p.gist ?? "").slice(0, 160),
      });
    }

    const hasBody = lawRes.items.length > 0 || precItems.length > 0;
    const context: ComprehensiveLegalContext = {
      riskScore: hasBody ? 42 : 22,
      riskLevel: hasBody ? "MEDIUM" : "LOW",
      citations: citations.slice(0, 8),
    };

    const systemBlock = `
[법령·판례 자료 (fallback) — extractLegalKeywords 기반 · 국가법령정보센터 Open API]
검색어: 법령「${lawQuery}」 / 판례「${precQuery}」
출처: https://www.law.go.kr

■ 관련 법령(상위 목록)
${formatLawLines(lawRes.items)}
${articleExcerpt ? `\n■ 조문 발췌(1건)\n${articleExcerpt}\n` : ""}
■ 관련 판례(요지)
${formatPrecLines(precItems)}

【답변 지침】
• 위에 없는 조문·판례는 창작하지 말고 law.go.kr 원문 확인을 안내하십시오.
`.trim();

    return { systemBlock, context };
  } catch (e) {
    console.warn(
      "[comprehensiveLegalEnrichment][fallback]",
      e instanceof Error ? e.message : e
    );
    return { systemBlock: "", context: empty };
  }
}
