/**
 * lib/lawDbClient.ts
 *
 * DB 캐시에서 법령 조문·판례를 조회한다.
 * GitHub Actions 크론잡이 매일 새벽 law.go.kr → Neon DB에 저장한 데이터를 사용.
 * law.go.kr IP 차단 문제를 완전히 우회한다.
 */

import { prisma } from "@/lib/prisma";
import type { LawArticle } from "@/lib/law-api";

// ── 법령 조문 DB 조회 ──────────────────────────────────────────────────────

export type DbLawResult = {
  lawName: string;
  articles: LawArticle[];
  source: "db" | "empty";
  fetchedAt?: Date;
};

/**
 * 법령명으로 조문 조회.
 * keywords 배열이 있으면 조문 제목·내용 기준 필터링.
 */
export async function getLawArticlesFromDb(
  lawName: string,
  keywords: string[] = []
): Promise<DbLawResult> {
  try {
    // 부분 일치 (LIKE) — "청탁금지법"으로 검색해도 정식명칭 매칭
    const rows = await prisma.lawArticleCache.findMany({
      where: {
        lawName: { contains: lawName.slice(0, 15) },
      },
      orderBy: [{ articleNo: "asc" }, { articleSub: "asc" }],
    });

    if (rows.length === 0) return { lawName, articles: [], source: "empty" };

    const resolvedName = rows[0].lawName;
    const fetchedAt = rows[0].fetchedAt;

    let articles: LawArticle[] = rows.map((r) => ({
      no: r.articleNo,
      sub: r.articleSub,
      title: r.articleTitle,
      content: r.content,
    }));

    // 키워드 필터링
    if (keywords.length > 0) {
      const filtered = articles.filter((a) => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some((k) => text.includes(k.toLowerCase()));
      });
      articles = filtered.length > 0 ? filtered.slice(0, 5) : articles.slice(0, 3);
    } else {
      articles = articles.slice(0, 5);
    }

    return { lawName: resolvedName, articles, source: "db", fetchedAt };
  } catch (err) {
    console.warn("[lawDbClient] getLawArticlesFromDb 오류:", (err as Error).message);
    return { lawName, articles: [], source: "empty" };
  }
}

// ── 판례 DB 조회 ────────────────────────────────────────────────────────────

export type DbPrecedent = {
  caseNo: string;
  court: string;
  date: string;
  title: string;
  gist: string;
};

/**
 * 키워드와 가장 가까운 판례 목록 반환 (최대 10건).
 * 키워드 정확 매칭 → 없으면 부분 매칭 순으로 fallback.
 */
export async function getPrecedentsFromDb(
  keyword: string,
  limit = 10
): Promise<DbPrecedent[]> {
  try {
    // 1순위: 정확한 키워드
    let rows = await prisma.precedentCache.findMany({
      where: { keyword },
      take: limit,
      orderBy: { fetchedAt: "desc" },
    });

    // 2순위: 부분 매칭 (keyword를 단어로 분리해 가장 많이 겹치는 키워드 그룹)
    if (rows.length === 0) {
      const tokens = keyword.split(/\s+/).filter((t) => t.length >= 2);
      for (const token of tokens) {
        const partial = await prisma.precedentCache.findMany({
          where: { keyword: { contains: token } },
          take: limit,
          orderBy: { fetchedAt: "desc" },
        });
        if (partial.length > 0) {
          rows = partial;
          break;
        }
      }
    }

    return rows.map((r) => ({
      caseNo: r.caseNo,
      court: r.court ?? "",
      date: r.date ?? "",
      title: r.title,
      gist: r.gist ?? "",
    }));
  } catch (err) {
    console.warn("[lawDbClient] getPrecedentsFromDb 오류:", (err as Error).message);
    return [];
  }
}

/**
 * 사용자 질문으로 관련 판례 조회.
 * 질문 토큰 → 저장된 키워드 매칭으로 최적 판례 반환.
 */
export async function getRelevantPrecedentsFromDb(
  userText: string,
  limit = 6
): Promise<DbPrecedent[]> {
  // 질문에서 주요 토큰 추출
  const stopwords = new Set(["저는", "제가", "있는데", "되나요", "했는데", "합니다", "있나요"]);
  const tokens = userText
    .replace(/[^가-힣ᄀ-ᇿ㄰-㆏a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopwords.has(t));

  if (tokens.length === 0) return [];

  // OR 조건으로 여러 키워드 동시 조회
  try {
    const rows = await prisma.precedentCache.findMany({
      where: {
        OR: tokens.slice(0, 6).map((t) => ({
          keyword: { contains: t },
        })),
      },
      take: limit * 2,
      orderBy: { fetchedAt: "desc" },
    });

    // 중복 제거 (caseNo 기준)
    const seen = new Set<string>();
    const deduped: DbPrecedent[] = [];
    for (const r of rows) {
      if (!seen.has(r.caseNo)) {
        seen.add(r.caseNo);
        deduped.push({
          caseNo: r.caseNo,
          court: r.court ?? "",
          date: r.date ?? "",
          title: r.title,
          gist: r.gist ?? "",
        });
      }
      if (deduped.length >= limit) break;
    }
    return deduped;
  } catch (err) {
    console.warn("[lawDbClient] getRelevantPrecedentsFromDb 오류:", (err as Error).message);
    return [];
  }
}

/**
 * DB에 캐시된 법령 목록 반환 (lawName 중복 제거).
 * 마지막 업데이트 시각도 포함.
 */
export async function getCachedLawList(): Promise<
  Array<{ lawName: string; articleCount: number; updatedAt: Date }>
> {
  try {
    const grouped = await prisma.lawArticleCache.groupBy({
      by: ["lawName"],
      _count: { id: true },
      _max: { updatedAt: true },
    });
    return grouped.map((g) => ({
      lawName: g.lawName,
      articleCount: g._count.id,
      updatedAt: g._max.updatedAt ?? new Date(0),
    }));
  } catch {
    return [];
  }
}
