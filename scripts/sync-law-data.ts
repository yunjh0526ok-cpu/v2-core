/**
 * scripts/sync-law-data.ts
 *
 * GitHub Actions 크론잡에서 실행되는 법령·판례 DB 동기화 스크립트.
 * GitHub 서버 IP로 law.go.kr API 호출 → Neon DB에 upsert.
 *
 * 실행: npx tsx scripts/sync-law-data.ts
 * 환경변수: DATABASE_URL, DATABASE_URL_UNPOOLED, LAW_API_KEY
 */

import { PrismaClient } from "@prisma/client";
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const text = await res.text();
  if (text.trim().startsWith("{")) throw new Error(`JSON error: ${text.slice(0, 200)}`);
  return text;
}

async function searchLaw(query: string): Promise<{ id: string; mst?: string; name: string } | null> {
  const url = `${LAW_BASE}/lawSearch.do?OC=${encodeURIComponent(API_KEY)}&target=law&type=XML&query=${encodeURIComponent(query)}&display=5`;
  const text = await fetchXml(url);
  if (!/^<\??xml|^<LawSearch/i.test(text.trim())) return null;
  const root = (xmlParser.parse(text) as { LawSearch?: Record<string, unknown> }).LawSearch ?? {};
  const list = Array.isArray(root.law) ? (root.law as Record<string, unknown>[]) : [];
  const first = list[0];
  if (!first) return null;
  return {
    id: String(first["법령ID"] ?? first["법령일련번호"] ?? ""),
    mst: first["법령MST"] ? String(first["법령MST"]) : undefined,
    name: String(first["법령명한글"] ?? first["법령명"] ?? query),
  };
}

type RawArticle = { no: string; sub: string; title: string; content: string };

async function fetchArticles(mstOrId: string, useMst: boolean): Promise<RawArticle[]> {
  const idParam = useMst ? `MST=${encodeURIComponent(mstOrId)}` : `ID=${encodeURIComponent(mstOrId)}`;
  const url = `${LAW_BASE}/lawService.do?OC=${encodeURIComponent(API_KEY)}&target=law&type=XML&${idParam}`;
  const text = await fetchXml(url);
  if (!/^<\??xml|^<법령/i.test(text.trim())) return [];
  const law = (xmlParser.parse(text) as { 법령?: Record<string, unknown> }).법령 ?? {};
  const jomun = (law.조문 as Record<string, unknown>) ?? {};
  const units = Array.isArray(jomun.조문단위) ? (jomun.조문단위 as Record<string, unknown>[]) : [];
  return units.map((u) => {
    const no = String(u["조문번호"] ?? "");
    const sub = String(u["조문가지번호"] ?? "");
    const title = String(u["조문제목"] ?? "");
    const body = String(u["조문내용"] ?? "");
    const paragraphs = Array.isArray(u["항"])
      ? (u["항"] as Record<string, unknown>[]).map((p) => String(p["항내용"] ?? "").trim()).filter(Boolean).join("\n")
      : "";
    const content = [body, paragraphs].filter(Boolean).join("\n").trim();
    return { no, sub, title, content };
  }).filter((a) => a.content);
}

async function fetchPrecedents(keyword: string, display = 10) {
  const url = `${LAW_BASE}/lawSearch.do?OC=${encodeURIComponent(API_KEY)}&target=prec&type=XML&query=${encodeURIComponent(keyword)}&display=${display}`;
  const text = await fetchXml(url);
  if (!/^<\??xml|^<PrecSearch/i.test(text.trim())) return [];
  const root = (xmlParser.parse(text) as { PrecSearch?: Record<string, unknown> }).PrecSearch ?? {};
  const list = Array.isArray(root.prec) ? (root.prec as Record<string, unknown>[]) : [];
  return list.map((r) => ({
    caseNo: String(r["사건번호"] ?? ""),
    court: String(r["법원명"] ?? ""),
    date: String(r["선고일자"] ?? ""),
    title: String(r["사건명"] ?? r["판례명"] ?? ""),
    gist: String(r["판결요지"] ?? r["판시사항"] ?? r["판례내용"] ?? "").replace(/\s+/g, " ").slice(0, 400),
  }));
}

async function syncLaw(lawQuery: string): Promise<void> {
  console.log(`\n📖 법령 동기화: "${lawQuery}"`);
  const found = await searchLaw(lawQuery);
  if (!found) { console.warn(`  ⚠ 검색 결과 없음: "${lawQuery}"`); return; }
  console.log(`  → 찾음: "${found.name}" (MST: ${found.mst ?? found.id})`);
  const articles = await fetchArticles(found.mst ?? found.id, !!found.mst);
  console.log(`  → 조문 ${articles.length}개 취득`);
  let upserted = 0;
  for (const a of articles) {
    await prisma.lawArticleCache.upsert({
      where: { lawName_articleNo_articleSub: { lawName: found.name, articleNo: a.no, articleSub: a.sub } },
      update: { lawId: found.id, lawMst: found.mst, articleTitle: a.title, content: a.content, fetchedAt: new Date() },
      create: { lawName: found.name, lawId: found.id, lawMst: found.mst, articleNo: a.no, articleSub: a.sub, articleTitle: a.title, content: a.content },
    });
    upserted++;
  }
  console.log(`  ✅ ${upserted}개 upsert 완료`);
}

async function syncPrecedents(keyword: string): Promise<void> {
  console.log(`\n⚖️  판례 동기화: "${keyword}"`);
  const precs = await fetchPrecedents(keyword, 10);
  console.log(`  → ${precs.length}건 취득`);
  let upserted = 0;
  for (const p of precs) {
    if (!p.caseNo) continue;
    await prisma.precedentCache.upsert({
      where: { keyword_caseNo: { keyword, caseNo: p.caseNo } },
      update: { court: p.court, date: p.date, title: p.title, gist: p.gist, fetchedAt: new Date() },
      create: { keyword, caseNo: p.caseNo, court: p.court, date: p.date, title: p.title, gist: p.gist },
    });
    upserted++;
  }
  console.log(`  ✅ ${upserted}건 upsert 완료`);
}

async function main() {
  if (!API_KEY) { console.error("❌ LAW_API_KEY 환경변수가 설정되지 않았습니다."); process.exit(1); }
  console.log("===== 법령·판례 DB 동기화 시작 =====");
  console.log(`대상 법령: ${LAWS_TO_SYNC.length}개 / 판례 키워드: ${PREC_KEYWORDS.length}개\n`);
  for (const law of LAWS_TO_SYNC) {
    try { await syncLaw(law); } catch (err) { console.error(`  ❌ 법령 동기화 실패 (${law}):`, (err as Error).message); }
    await new Promise((r) => setTimeout(r, 600));
  }
  for (const kw of PREC_KEYWORDS) {
    try { await syncPrecedents(kw); } catch (err) { console.error(`  ❌ 판례 동기화 실패 (${kw}):`, (err as Error).message); }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.log("\n===== 동기화 완료 =====");
  const [lawCount, precCount] = await Promise.all([prisma.lawArticleCache.count(), prisma.precedentCache.count()]);
  console.log(`DB 현황 — 법령 조문: ${lawCount}건 / 판례: ${precCount}건`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); }).finally(() => prisma.$disconnect());
