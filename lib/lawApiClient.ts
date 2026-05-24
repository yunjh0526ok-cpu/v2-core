/**
 * lawApiClient.ts
 * 국가법령정보 Open API 연동 — 법령 원문 조문·판례 조회 전용 클라이언트.
 * 기존 law-api.ts 의 공통 유틸을 재사용하고 캐싱·필터링 레이어를 추가한다.
 *
 * 환경변수:
 *   LAW_API_KEY       - open.law.go.kr 승인 OC 값 (필수)
 *   LAW_API_BASE_URL  - 기본값 https://www.law.go.kr/DRF
 */
import {
  searchLaws,
  fetchLawDetail,
  searchPrecedents,
  type LawArticle,
} from "@/lib/law-api";

// ── 서버 메모리 캐시 (프로세스 수명 내 재호출 방지) ──────────────────────
const articleCache = new Map<
  string,
  { articles: LawArticle[]; source: "api" | "fallback" }
>();
const precCache = new Map<string, Array<{ caseNo: string; summary: string }>>();

export type LawFetchResult = {
  lawName: string;
  articles: LawArticle[];
  /** api: 실제 API 성공 / fallback: API 미응답 */
  source: "api" | "fallback";
};

/**
 * 법령명 + 키워드로 관련 조문만 필터링해서 반환.
 * 동일 요청은 캐시에서 즉시 반환.
 */
export async function fetchLawArticlesForKeywords(
  lawName: string,
  keywords: string[] = []
): Promise<LawFetchResult> {
  const cacheKey = `${lawName}::${keywords.slice(0, 4).join(",")}`;

  if (articleCache.has(cacheKey)) {
    const cached = articleCache.get(cacheKey)!;
    return { lawName, ...cached };
  }

  const store = (
    articles: LawArticle[],
    source: "api" | "fallback"
  ): LawFetchResult => {
    articleCache.set(cacheKey, { articles, source });
    return { lawName, articles, source };
  };

  try {
    const searchRes = await searchLaws(lawName);
    const first = searchRes.items[0];
    if (!first) return store([], "fallback");

    const detail = await fetchLawDetail(first.mst ?? first.id, lawName);
    let articles = detail.articles;

    // 키워드로 관련 조문 필터링
    if (keywords.length > 0) {
      const filtered = articles.filter((a) => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some((k) => text.includes(k.toLowerCase()));
      });
      articles =
        filtered.length > 0 ? filtered.slice(0, 5) : articles.slice(0, 3);
    } else {
      articles = articles.slice(0, 5);
    }

    return store(articles, articles.length > 0 ? "api" : "fallback");
  } catch (err) {
    console.warn(
      "[lawApiClient] fetchLawArticlesForKeywords failed:",
      (err as Error).message
    );
    return store([], "fallback");
  }
}

/**
 * 키워드로 판례 요약 목록 조회 (최대 3건).
 * 캐시 적중 시 API 재호출 없음.
 */
export async function fetchRelevantPrecedentSummaries(
  keyword: string
): Promise<Array<{ caseNo: string; summary: string }>> {
  if (precCache.has(keyword)) return precCache.get(keyword)!;

  try {
    const rows = await searchPrecedents(keyword, 3);
    const result = rows.map((r) => ({
      caseNo: r.caseNo || "사건번호 미상",
      summary: (r.gist || "").slice(0, 200),
    }));
    precCache.set(keyword, result);
    return result;
  } catch {
    precCache.set(keyword, []);
    return [];
  }
}
