/**
 * lawApiClient.ts
 * 국가법령정보 Open API 연동 — DB 캐시 우선, 미스 시 Edge 프록시 fallback.
 *
 * 흐름:
 *   1. DB 캐시 조회 (lawDbClient) — 가장 빠름, Vercel IP 차단 무관
 *   2. DB miss → /api/law/proxy (Edge Function) 경유 law.go.kr 직접 호출
 *   3. 둘 다 실패 → fallback: 빈 배열 반환 (analyzeRisk 로컬 KB 사용)
 */

import { XMLParser } from "fast-xml-parser";
import type { LawArticle } from "@/lib/law-api";
import {
  getLawArticlesFromDb,
  getPrecedentsFromDb,
  getRelevantPrecedentsFromDb,
} from "@/lib/lawDbClient";

// ── XML 파서 ──────────────────────────────────────────────────────────────
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["law", "prec", "조문단위", "항", "호", "목", "조문참고자료"].includes(name),
  textNodeName: "#text",
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

// ── 서버 메모리 캐시 (DB 미스 후 프록시 결과 재사용) ─────────────────────
const articleCache = new Map<
  string,
  { articles: LawArticle[]; source: "api" | "fallback" }
>();
const precCache = new Map<string, Array<{ caseNo: string; summary: string }>>();

export type LawFetchResult = {
  lawName: string;
  articles: LawArticle[];
  source: "db" | "api" | "fallback";
};

// ── 내부 프록시 Base URL ──────────────────────────────────────────────────
function getInternalBase(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

async function proxyFetch(params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams(params).toString();
  const url = `${getInternalBase()}/api/law/proxy?${qs}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`proxy ${res.status}: ${await res.text().catch(() => "")}`);
  const text = await res.text();
  if (text.trim().startsWith("{")) {
    const parsed = JSON.parse(text) as { error?: string };
    throw new Error(parsed.error ?? "proxy returned JSON error");
  }
  return text;
}

// ── 응답 정규화 ───────────────────────────────────────────────────────────
type LawSearchItem = { id: string; mst?: string; name: string };

function parseLawSearchXml(xml: string): LawSearchItem[] {
  if (!/^<\??xml|^<LawSearch/i.test(xml.trim())) {
    throw new Error("non-XML response from proxy");
  }
  const root =
    (xmlParser.parse(xml) as { LawSearch?: Record<string, unknown> }).LawSearch ?? {};
  const rawList = Array.isArray(root.law)
    ? (root.law as Record<string, unknown>[])
    : [];
  return rawList.map((r, i) => ({
    id: String(r["법령ID"] ?? r["법령일련번호"] ?? `l-${i}`),
    mst: r["법령MST"] ? String(r["법령MST"]) : undefined,
    name: String(r["법령명한글"] ?? r["법령명"] ?? "(제목없음)"),
  }));
}

function parseLawDetailXml(
  xml: string,
  fallbackName: string
): { name: string; articles: LawArticle[] } {
  if (!/^<\??xml|^<법령/i.test(xml.trim())) {
    throw new Error("non-XML detail response from proxy");
  }
  const law =
    (xmlParser.parse(xml) as { 법령?: Record<string, unknown> }).법령 ?? {};
  const basic = (law.기본정보 as Record<string, unknown>) ?? {};
  const name = String(basic["법령명_한글"] ?? basic["법령명한글"] ?? fallbackName);
  const jomun = (law.조문 as Record<string, unknown>) ?? {};
  const units = Array.isArray(jomun.조문단위)
    ? (jomun.조문단위 as Record<string, unknown>[])
    : [];
  const articles: LawArticle[] = units
    .map((u) => {
      const no = String(u["조문번호"] ?? "");
      const sub = String(u["조문가지번호"] ?? "");
      const title = String(u["조문제목"] ?? "");
      const body = String(u["조문내용"] ?? "");
      const paragraphs = Array.isArray(u["항"])
        ? (u["항"] as Record<string, unknown>[])
            .map((p) => String(p["항내용"] ?? "").trim())
            .filter(Boolean)
            .join("\n")
        : "";
      const content = [body, paragraphs].filter(Boolean).join("\n").trim();
      return { no, sub, title, content };
    })
    .filter((a) => a.content);
  return { name, articles };
}

function parsePrecSearchXml(xml: string): Array<{ caseNo: string; summary: string }> {
  if (!/^<\??xml|^<PrecSearch/i.test(xml.trim())) {
    throw new Error("non-XML precedent response from proxy");
  }
  const root =
    (xmlParser.parse(xml) as { PrecSearch?: Record<string, unknown> }).PrecSearch ?? {};
  const rawList = Array.isArray(root.prec)
    ? (root.prec as Record<string, unknown>[])
    : [];
  return rawList.slice(0, 3).map((r) => ({
    caseNo: String(r["사건번호"] ?? "사건번호 미상"),
    summary: String(r["판결요지"] ?? r["판시사항"] ?? r["판례내용"] ?? "")
      .replace(/\s+/g, " ")
      .slice(0, 200),
  }));
}

// ── 공개 API ──────────────────────────────────────────────────────────────

/**
 * 법령명 + 키워드로 관련 조문 반환.
 * 우선순위: DB 캐시 → Edge 프록시 → fallback(빈 배열)
 */
export async function fetchLawArticlesForKeywords(
  lawName: string,
  keywords: string[] = []
): Promise<LawFetchResult> {
  // 1. DB 캐시 조회
  const dbResult = await getLawArticlesFromDb(lawName, keywords);
  if (dbResult.articles.length > 0) {
    console.log(`[lawApiClient] ✅ DB 캐시 히트: "${dbResult.lawName}" (${dbResult.articles.length}개)`);
    return { lawName: dbResult.lawName, articles: dbResult.articles, source: "db" };
  }

  // 2. DB miss → 프록시 fallback
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
    const searchXml = await proxyFetch({ target: "law", query: lawName, display: "10", type: "XML" });
    const searchItems = parseLawSearchXml(searchXml);
    const first = searchItems[0];
    if (!first) return store([], "fallback");

    const idParams: Record<string, string> = { target: "law", type: "XML" };
    if (first.mst) idParams["MST"] = first.mst;
    else idParams["ID"] = first.id;

    const detailXml = await proxyFetch(idParams);
    const { name: resolvedName, articles: allArticles } = parseLawDetailXml(detailXml, lawName);
    console.log(`[lawApiClient] ✅ 프록시 취득: "${resolvedName}" (${allArticles.length}개 조문)`);

    let articles = allArticles;
    if (keywords.length > 0) {
      const filtered = allArticles.filter((a) => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some((k) => text.includes(k.toLowerCase()));
      });
      articles = filtered.length > 0 ? filtered.slice(0, 5) : allArticles.slice(0, 3);
    } else {
      articles = allArticles.slice(0, 5);
    }
    return store(articles, articles.length > 0 ? "api" : "fallback");
  } catch (err) {
    console.warn("[lawApiClient] 프록시 오류 (DB 미스):", (err as Error).message);
    return store([], "fallback");
  }
}

/**
 * 키워드로 판례 요약 목록 조회.
 * 우선순위: DB 캐시 → Edge 프록시 → fallback(빈 배열)
 */
export async function fetchRelevantPrecedentSummaries(
  keyword: string
): Promise<Array<{ caseNo: string; summary: string }>> {
  // 1. DB 캐시
  const dbPrecs = await getPrecedentsFromDb(keyword, 5);
  if (dbPrecs.length > 0) {
    console.log(`[lawApiClient] ✅ DB 판례 히트: "${keyword}" (${dbPrecs.length}건)`);
    return dbPrecs.map((p) => ({
      caseNo: p.caseNo,
      summary: p.gist?.slice(0, 200) ?? p.title,
    }));
  }

  // 2. 사용자 질문 기반 DB 판례 검색
  const relevant = await getRelevantPrecedentsFromDb(keyword, 5);
  if (relevant.length > 0) {
    console.log(`[lawApiClient] ✅ DB 판례 키워드 매칭: ${relevant.length}건`);
    return relevant.map((p) => ({
      caseNo: p.caseNo,
      summary: p.gist?.slice(0, 200) ?? p.title,
    }));
  }

  // 3. 프록시 fallback
  if (precCache.has(keyword)) return precCache.get(keyword)!;

  try {
    const xml = await proxyFetch({ target: "prec", query: keyword, display: "3", type: "XML" });
    const result = parsePrecSearchXml(xml);
    precCache.set(keyword, result);
    return result;
  } catch (err) {
    console.warn("[lawApiClient] 판례 프록시 오류:", (err as Error).message);
    precCache.set(keyword, []);
    return [];
  }
}
