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
