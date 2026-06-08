/**
 * scripts/sync-law-data.ts
 *
 * GitHub Actions 크론잡에서 실행되는 법령·판례 DB 동기화 스크립트.
 * GitHub 서버 IP로 law.go.kr API 호출 → Neon DB에 upsert.
 *
 * 실행: npx tsx scripts/sync-law-data.ts
 * 환경변수: DATABASE_URL, DATABASE_URL_UNPOOLED, LAW_API_KEY
 */

import { PrismaClient } from "../lib/generated/prisma";
import { XMLParser } from "fast-xml-parser";

const prisma = new PrismaClient();

const LAW_BASE = "https://www.law.go.kr/DRF";
const API_KEY = process.env.LAW_API_KEY ?? "";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  isArray: (name) =>
    ["law", "prec", "조문단위", "항", "호", "목"].includes(name),
  textNodeName: "#text",
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

const LAWS_TO_SYNC = [
  "부정청탁 및 금품등 수수의 금지에 관한 법률",
  "공직자의 이해충돌 방지법",
  "공직자윤리법",
  "근로기준법",
  "국가를 당사자로 하는 계약에 관한 법률",
  "공무원 행동강령",
  "공익신고자 보호법",
  "부패방지 및 국민권익위원회의 설치와 운영에 관한 법률",
];

const PREC_KEYWORDS = [
  "청탁금지법 금품수수",
  "이해충돌방지법 사적이해관계",
  "직장내괴롭힘 공무원 징계",
  "부정청탁 금지 처분",
  "공직자 선물 수수 과태료",
  "공무원 금품 수수 해임",
  "청탁금지법 식사 상한",
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Referer: "https://www.law.go.kr",
  Accept: "application/xml, text/xml, */*",
};

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + url);
  const text = await res.text();
  if (text.trim().startsWith("{")) throw new Error('JSON error: ' + text.slice(0, 200));
  return text;
}

async function searchLaw(query: string): Promise<{ id: string; mst?: string; name: string } | null> {
  const url = LAW_BASE + '/lawSearch.do?OC=' + encodeURIComponent(API_KEY) + '&target=law&type=XML&query=' + encodeURIComponent(query) + '&display=5';
  const text = await fetchXml(url);
  if (!/^<\??xml|^<LawSearch/i.test(text.trim())) return null;
  const root = (xmlParser.parse(text) as { LawSearch?: Record<string, unknown> }).LawSearch ?? {};
  const list = Array.isArray(root.law) ? (root.law as Record<string, unknown>[]) : [];
  if (!list.length) return null;
  const exact = list.find((l) => String(l["법령명"] ?? "").trim() === query.trim());
  const item = (exact ?? list[0]) as Record<string, unknown>;
  return {
    id: String(item["법령ID"] ?? ""),
    mst: item["법령일련번호"] ? String(item["법령일련번호"]) : undefined,
    name: String(item["법령명"] ?? query),
  };
}

async function fetchLawArticles(mst: string): Promise<Array<{ articleNo: string; articleTitle: string; content: string }>> {
  const url = LAW_BASE + '/lawService.do?OC=' + encodeURIComponent(API_KEY) + '&target=law&MST=' + mst + '&type=XML';
  const text = await fetchXml(url);
  if (!/^<\??xml|^<법령/i.test(text.trim())) return [];
  const parsed = xmlParser.parse(text) as Record<string, unknown>;
  const lawRoot = (parsed["법령"] ?? parsed) as Record<string, unknown>;
  const body = (lawRoot["조문"] ?? lawRoot["법령본문"]) as Record<string, unknown> | undefined;
  if (!body) return [];
  const articles = Array.isArray(body["조문단위"]) ? (body["조문단위"] as Record<string, unknown>[]) : [];
  return articles.map((a) => ({
    articleNo: String(a["조문번호"] ?? ""),
    articleTitle: String(a["조문제목"] ?? ""),
    content: JSON.stringify(a),
  }));
}

async function syncLaws(): Promise<void> {
  console.log("=== 법령 동기화 시작 ===");
  for (const lawName of LAWS_TO_SYNC) {
    try {
      console.log('[법령] ' + lawName + ' 검색 중...');
      const info = await searchLaw(lawName);
      if (!info || !info.mst) {
        console.warn("  → 찾을 수 없음");
        continue;
      }
      const articles = await fetchLawArticles(info.mst);
      console.log('  → ' + articles.length + '개 조문');
      for (const art of articles) {
        await prisma.lawArticleCache.upsert({
          where: { lawName_articleNo: { lawName: info.name, articleNo: art.articleNo } },
          update: { articleTitle: art.articleTitle, content: art.content, updatedAt: new Date() },
          create: { lawName: info.name, articleNo: art.articleNo, articleTitle: art.articleTitle, content: art.content },
        });
      }
      console.log("  → DB upsert 완료");
    } catch (e) {
      console.error('[법령] ' + lawName + ' 실패:', e instanceof Error ? e.message : e);
    }
  }
}

async function searchPrecedents(keyword: string): Promise<Array<{ caseNo: string; caseNm: string; court: string; date: string; summary: string }>> {
  const url = LAW_BASE + '/precSearch.do?OC=' + encodeURIComponent(API_KEY) + '&target=prec&type=XML&query=' + encodeURIComponent(keyword) + '&display=10';
  const text = await fetchXml(url);
  if (!/^<\??xml|^<PrecSearch/i.test(text.trim())) return [];
  const root = (xmlParser.parse(text) as { PrecSearch?: Record<string, unknown> }).PrecSearch ?? {};
  const list = Array.isArray(root.prec) ? (root.prec as Record<string, unknown>[]) : [];
  return list.map((p) => ({
    caseNo: String(p["판례일련번호"] ?? p["사건번호"] ?? ""),
    caseNm: String(p["사건명"] ?? ""),
    court: String(p["법원명"] ?? ""),
    date: String(p["선고일자"] ?? ""),
    summary: String(p["판시사항"] ?? p["판결요지"] ?? ""),
  }));
}

async function syncPrecedents(): Promise<void> {
  console.log("=== 판례 동기화 시작 ===");
  for (const keyword of PREC_KEYWORDS) {
    try {
      console.log('[판례] "' + keyword + '" 검색 중...');
      const precs = await searchPrecedents(keyword);
      console.log('  → ' + precs.length + '개');
      for (const p of precs) {
        if (!p.caseNo) continue;
        await prisma.precedentCache.upsert({
          where: { caseNo: p.caseNo },
          update: { caseNm: p.caseNm, court: p.court, date: p.date, summary: p.summary, keyword, updatedAt: new Date() },
          create: { caseNo: p.caseNo, caseNm: p.caseNm, court: p.court, date: p.date, summary: p.summary, keyword },
        });
      }
      console.log("  → DB upsert 완료");
    } catch (e) {
      console.error('[판례] "' + keyword + '" 실패:', e instanceof Error ? e.message : e);
    }
  }
}

async function main() {
  try {
    await syncLaws();
    await syncPrecedents();
    console.log("✅ 동기화 완료");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
