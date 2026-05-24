/**
 * lawApiClient.ts
 * 국가법령정보 Open API 연동 — Edge Function 프록시(/api/law/proxy)를 경유한 클라이언트.
 *
 * ▶ 문제: Vercel 서버리스 함수 IP는 law.go.kr에서 차단됨
 * ▶ 해결: /api/law/proxy (Edge Function, Cloudflare Workers 대역)를 거쳐 XML 취득
 *
 * 환경변수:
 *   VERCEL_URL         - Vercel이 자동 주입하는 배포 URL (https:// 없음)
 *   NEXT_PUBLIC_BASE_URL - 로컬 오버라이드용 (http://localhost:3000 등)
 */

import { XMLParser } from "fast-xml-parser";
import type { LawArticle } from "@/lib/law-api";

// ── XML 파서 (law-api.ts 와 동일한 설정) ──────────────────────────────────
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

// ── 내부 프록시 Base URL ──────────────────────────────────────────────────
function getInternalBase(): string {
  // NEXT_PUBLIC_BASE_URL 최우선 (명시적 override)
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  // Vercel 배포 환경
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // 로컬 개발 환경 (Next.js 기본 포트)
  return "http://localhost:3000";
}

/**
 * /api/law/proxy 를 통해 law.go.kr XML을 취득한다.
 * Edge Function이 Cloudflare Workers 대역 IP로 실행되어 차단을 우회한다.
 */
async function proxyFetch(params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams(params).toString();
  const url = `${getInternalBase()}/api/law/proxy?${qs}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`proxy ${res.status}: ${await res.text().catch(() => "")}`);

  const text = await res.text();
  // proxy가 JSON 에러를 반환한 경우 (503, 502 등)
  if (text.trim().startsWith("{")) {
    const parsed = JSON.parse(text) as { error?: string };
    throw new Error(parsed.error ?? "proxy returned JSON error");
  }
  return text;
}

// ── 법령 검색 응답 정규화 ─────────────────────────────────────────────────
type LawSearchItem = {
  id: string;
  mst?: string;
  name: string;
};

function parseLawSearchXml(xml: string): LawSearchItem[] {
  if (!/^<\??xml|^<LawSearch/i.test(xml.trim())) {
    throw new Error("non-XML response from proxy (possible auth/quota issue)");
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

// ── 법령 조문 응답 정규화 ─────────────────────────────────────────────────
function parseLawDetailXml(xml: string, fallbackName: string): { name: string; articles: LawArticle[] } {
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

// ── 판례 검색 응답 정규화 ─────────────────────────────────────────────────
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
 * 법령명 + 키워드로 관련 조문만 필터링해서 반환.
 * 동일 요청은 캐시에서 즉시 반환.
 * 프록시(/api/law/proxy)를 경유하여 Vercel IP 차단을 우회한다.
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
    // 1단계: 법령 검색
    const searchXml = await proxyFetch({
      target: "law",
      query: lawName,
      display: "10",
      type: "XML",
    });
    const searchItems = parseLawSearchXml(searchXml);
    const first = searchItems[0];
    if (!first) {
      console.warn(`[lawApiClient] 검색 결과 없음: "${lawName}"`);
      return store([], "fallback");
    }

    // 2단계: 조문 조회
    const idParams: Record<string, string> = {
      target: "law",
      type: "XML",
    };
    if (first.mst) {
      idParams["MST"] = first.mst;
    } else {
      idParams["ID"] = first.id;
    }
    const detailXml = await proxyFetch(idParams);
    const { name: resolvedName, articles: allArticles } = parseLawDetailXml(detailXml, lawName);
    console.log(
      `[lawApiClient] ✅ 법령 원문 취득: "${resolvedName}" (${allArticles.length}개 조문)`
    );

    // 3단계: 키워드 필터링
    let articles = allArticles;
    if (keywords.length > 0) {
      const filtered = allArticles.filter((a) => {
        const text = `${a.title} ${a.content}`.toLowerCase();
        return keywords.some((k) => text.includes(k.toLowerCase()));
      });
      articles =
        filtered.length > 0 ? filtered.slice(0, 5) : allArticles.slice(0, 3);
    } else {
      articles = allArticles.slice(0, 5);
    }

    return store(articles, articles.length > 0 ? "api" : "fallback");
  } catch (err) {
    console.error(
      "[lawApiClient] fetchLawArticlesForKeywords proxy 오류:",
      (err as Error).message
    );
    return store([], "fallback");
  }
}

/**
 * 키워드로 판례 요약 목록 조회 (최대 3건).
 * 캐시 적중 시 API 재호출 없음.
 * 프록시(/api/law/proxy)를 경유하여 Vercel IP 차단을 우회한다.
 */
export async function fetchRelevantPrecedentSummaries(
  keyword: string
): Promise<Array<{ caseNo: string; summary: string }>> {
  if (precCache.has(keyword)) return precCache.get(keyword)!;

  try {
    const xml = await proxyFetch({
      target: "prec",
      query: keyword,
      display: "3",
      type: "XML",
    });
    const result = parsePrecSearchXml(xml);
    precCache.set(keyword, result);
    return result;
  } catch (err) {
    console.error(
      "[lawApiClient] fetchRelevantPrecedentSummaries proxy 오류:",
      (err as Error).message
    );
    precCache.set(keyword, []);
    return [];
  }
}
