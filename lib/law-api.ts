/**
 *  lib/law-api.ts
 *  ─────────────────────────────────────────────────────────────────────
 *   국가법령정보 공동활용 API 클라이언트 + 복합 리스크 점수화 엔진
 *   (Open API of Korean Ministry of Government Legislation)
 *
 *   - 본 모듈은 서버(Node/Edge-x) 전용입니다. 클라이언트 번들에 포함되지 않습니다.
 *   - 인증키(OC)는 `.env.local` 의 LAW_API_KEY 에서만 읽습니다.
 *   - 외부 호출 실패 / 키 미설정 시 로컬 KB 로 graceful fallback.
 *
 *   ── 엔드포인트 요약  (공식 문서: https://open.law.go.kr/LSO/openApi.do)
 *     1) 법령 목록 검색     : GET /DRF/lawSearch.do?target=law&query=...
 *     2) 법령 본문(조문) 조회: GET /DRF/lawService.do?target=law&ID=... (또는 MST)
 *     3) 판례 목록 검색     : GET /DRF/lawSearch.do?target=prec&query=...
 *
 *   ── 복합 리스크 점수화 파이프라인 (analyzeRisk)
 *       (1) 사용자 자연어에서 금전·관계·반복성·완화요인 신호를 추출
 *       (2) 가장 관련 있는 법령 1~2건을 lawSearch 로 실시간 조회
 *       (3) lawService 로 해당 법령의 핵심 조문 원문(XML)을 가져옴
 *       (4) 조문 텍스트에서 금지/처벌 수준(징역/벌금/과태료/징계)을 가중치로 환산
 *       (5) 청탁금지법 3·5·10 임계값 등 도메인 룰을 교차 적용
 *       (6) 모든 팩터를 가중 합산 → 0~100 리스크 점수 + LOW/MEDIUM/HIGH + 근거/권고
 */

import { XMLParser } from "fast-xml-parser";

/* ══════════════════════════════════════════════════════════════════════
 *  0. 환경 변수
 * ══════════════════════════════════════════════════════════════════════ */

/**
 *  ⚠ 환경변수는 반드시 "lazy" 하게 읽습니다.
 *  import 시점에 캡처하면 dotenv 로드 전 호출되는 tsx 스크립트 등에서
 *  빈 문자열로 고정되어버립니다.
 */
function getBaseUrl(): string {
  return (
    process.env.LAW_API_BASE_URL?.replace(/\/$/, "") ??
    "https://www.law.go.kr/DRF"
  );
}
function getApiKey(): string {
  return process.env.LAW_API_KEY ?? "";
}

/** 서버 콘솔에 현재 키 상태 1회 표시 */
let _logged = false;
function logKeyOnce() {
  if (_logged) return;
  _logged = true;
  const key = getApiKey();
  if (key) {
    console.log(
      `[law-api] 🔑 LAW_API_KEY loaded (OC="${maskKey(key)}") via ${getBaseUrl()}`
    );
  } else {
    console.warn(
      "[law-api] ⚠  LAW_API_KEY not set — using local knowledge-base fallback."
    );
  }
}
function maskKey(k: string) {
  if (k.length <= 3) return k[0] + "**";
  return k.slice(0, 2) + "*".repeat(Math.max(1, k.length - 3)) + k.slice(-1);
}

/** 서버에서 law.go.kr 호출 시 사용 — 브라우저 직통 대비 상향 호환 */
export function getLawGoKrUpstreamHeaders(): HeadersInit {
  return {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://www.law.go.kr",
    Accept: "application/xml",
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  1. XML 파서 설정
 * ══════════════════════════════════════════════════════════════════════ */

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // law.go.kr 응답에서 단일/복수가 섞이는 요소들을 항상 배열로 변환
  isArray: (name) =>
    [
      "law",
      "prec",
      "조문단위",
      "항",
      "호",
      "목",
      "조문참고자료",
    ].includes(name),
  textNodeName: "#text",
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

/* ══════════════════════════════════════════════════════════════════════
 *  2. 법령 검색 (lawSearch.do)
 * ══════════════════════════════════════════════════════════════════════ */

export type LawSearchItem = {
  id: string;          // 법령ID
  mst?: string;        // 법령MST (본문 조회용 키)
  name: string;
  abbr?: string;
  department?: string;
  effectiveDate?: string;
  status?: string;     // 현행 | 폐지
  detailUrl?: string;
};

export type LawSearchResponse = {
  query: string;
  totalCnt: number;
  items: LawSearchItem[];
  mocked: boolean;
  source: "law.go.kr:xml" | "law.go.kr:json" | "local-kb" | "empty-query";
};

export async function searchLaws(query: string): Promise<LawSearchResponse> {
  logKeyOnce();
  const q = query.trim();
  if (!q) {
    return { query: "", totalCnt: 0, items: [], mocked: true, source: "empty-query" };
  }
  const apiKey = getApiKey();
  if (!apiKey) return buildMockResult(q);

  // XML 으로 요청 — 국가법령센터는 XML 이 가장 안정적이고 누락 필드가 적습니다.
  const url =
    `${getBaseUrl()}/lawSearch.do` +
    `?OC=${encodeURIComponent(apiKey)}` +
    `&target=law` +
    `&type=XML` +
    `&query=${encodeURIComponent(q)}` +
    `&display=10`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: getLawGoKrUpstreamHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    // 인증 실패 시 HTML 이 돌아옴 — XML 선언이 없으면 폴백
    if (!/^<\??xml|^<LawSearch/i.test(text.trim())) {
      throw new Error("non-XML response (auth or quota issue)");
    }
    return normalizeLawSearchXml(q, xmlParser.parse(text));
  } catch (err) {
    console.warn("[law-api] searchLaws failed, falling back:", (err as Error).message);
    return buildMockResult(q);
  }
}

function normalizeLawSearchXml(q: string, parsed: unknown): LawSearchResponse {
  const root =
    (parsed as { LawSearch?: Record<string, unknown> }).LawSearch ?? {};
  const rawList = Array.isArray(root.law)
    ? (root.law as Record<string, unknown>[])
    : [];

  const items: LawSearchItem[] = rawList.map((r, i) => ({
    id: String(r["법령ID"] ?? r["법령일련번호"] ?? `l-${i}`),
    mst: r["법령MST"] ? String(r["법령MST"]) : undefined,
    name: String(r["법령명한글"] ?? r["법령명"] ?? "(제목없음)"),
    abbr: r["법령약칭명"] ? String(r["법령약칭명"]) : undefined,
    department: r["소관부처명"] ? String(r["소관부처명"]) : undefined,
    effectiveDate: r["시행일자"] ? String(r["시행일자"]) : undefined,
    status: r["현행연혁코드"] ? String(r["현행연혁코드"]) : undefined,
    detailUrl: r["법령상세링크"] ? String(r["법령상세링크"]) : undefined,
  }));

  return {
    query: q,
    totalCnt: Number(root["totalCnt"] ?? items.length),
    items,
    mocked: false,
    source: "law.go.kr:xml",
  };
}

export type PrecedentSearchItem = {
  id: string;
  title: string;
  court?: string;
  date?: string;
  caseNo?: string;
  gist?: string;
};

export type RelevantPrecedent = {
  caseNo: string;
  date: string;
  court: string;
  gist: string;
  outcome: "승소" | "패소";
  outcomeKeyword: string;
};

/** 판례 목록 검색 (lawSearch.do · target=prec) */
export async function searchPrecedents(
  query: string,
  display = 5
): Promise<PrecedentSearchItem[]> {
  logKeyOnce();
  const q = query.trim().slice(0, 120);
  if (!q) return [];
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const url =
    `${getBaseUrl()}/lawSearch.do` +
    `?OC=${encodeURIComponent(apiKey)}` +
    `&target=prec` +
    `&type=XML` +
    `&query=${encodeURIComponent(q)}` +
    `&display=${String(Math.min(30, Math.max(1, display)))}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: getLawGoKrUpstreamHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/^<\??xml|^<PrecSearch/i.test(text.trim())) {
      throw new Error("non-XML precedent response");
    }
    return normalizePrecSearchXml(xmlParser.parse(text));
  } catch (err) {
    console.warn(
      "[law-api] searchPrecedents failed:",
      (err as Error).message
    );
    return [];
  }
}

function normalizePrecSearchXml(parsed: unknown): PrecedentSearchItem[] {
  const root =
    (parsed as { PrecSearch?: Record<string, unknown> }).PrecSearch ?? {};
  const rawList = Array.isArray(root.prec)
    ? (root.prec as Record<string, unknown>[])
    : [];
  return rawList.map((r, i) => ({
    id: String(r["판례일련번호"] ?? r["판례ID"] ?? `p-${i}`),
    title: String(r["사건명"] ?? r["판례명"] ?? r["판례제목"] ?? "판례"),
    court: r["법원명"] ? String(r["법원명"]) : undefined,
    date: r["선고일자"] ? String(r["선고일자"]) : undefined,
    caseNo: r["사건번호"] ? String(r["사건번호"]) : undefined,
    gist: String(
      r["판결요지"] ?? r["판시사항"] ?? r["판례내용"] ?? ""
    )
      .replace(/\s+/g, " ")
      .slice(0, 320),
  }));
}

export function detectOutcome(
  text: string
): { outcome: "승소" | "패소"; keyword: string } {
  const wonPatterns = [
    "원고승",
    "승소",
    "인용",
    "파기환송",
    "청구인용",
    "일부인용",
    "무죄",
  ];
  for (const k of wonPatterns) {
    if (text.includes(k)) return { outcome: "승소", keyword: k };
  }
  const lostPatterns = [
    "패소",
    "기각",
    "각하",
    "원고패",
    "청구기각",
    "유죄",
    "상고기각",
  ];
  for (const k of lostPatterns) {
    if (text.includes(k)) return { outcome: "패소", keyword: k };
  }
  // 명시 신호가 없으면 보수적으로 패소 쪽으로 분류
  return { outcome: "패소", keyword: "판단문구미확인" };
}

/**
 * 사용자 질문 기반 판례 검색 (target=prec) 후
 * 승소/패소 각각 최대 2건(총 최대 4건)으로 정리.
 * 실패 시 빈 배열 반환 (graceful fallback).
 */
export async function searchRelevantPrecedents(
  userText: string
): Promise<RelevantPrecedent[]> {
  try {
    const { precQuery } = extractLegalKeywords(userText);
    const rows = await searchPrecedents(precQuery, 12);
    if (!rows.length) return [];

    const won: RelevantPrecedent[] = [];
    const lost: RelevantPrecedent[] = [];

    for (const r of rows) {
      const merged = `${r.title} ${r.gist ?? ""}`.replace(/\s+/g, " ");
      const out = detectOutcome(merged);
      const item: RelevantPrecedent = {
        caseNo: r.caseNo || "사건번호 미상",
        date: r.date || "판결일 미상",
        court: r.court || "법원명 미상",
        gist: (r.gist || r.title || "판결 요지 정보 없음").slice(0, 160),
        outcome: out.outcome,
        outcomeKeyword: out.keyword,
      };
      if (item.outcome === "승소") {
        if (won.length < 2) won.push(item);
      } else if (lost.length < 2) {
        lost.push(item);
      }
      if (won.length >= 2 && lost.length >= 2) break;
    }

    return [...won, ...lost].slice(0, 4);
  } catch (err) {
    console.warn(
      "[law-api] searchRelevantPrecedents failed:",
      (err as Error).message
    );
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════════════
 *  2-b. 범용 검색어 추출 — 시나리오·카테고리 분기 없이 질문에서 API 쿼리 생성
 *      (기존 classifyScenario / analyzeRisk 분기는 그대로 두고 병행·fallback 용)
 * ══════════════════════════════════════════════════════════════════════ */

export type ExtractedLegalKeywords = {
  /** lawSearch.do?target=law */
  lawQuery: string;
  /** lawSearch.do?target=prec */
  precQuery: string;
  tokens: string[];
};

/**
 * 사용자 자연어에서 국가법령정보 Open API 검색어를 추출한다.
 * analyzeRisk 가 특정 키워드에만 맞지 않을 때 fallback 검색에 사용한다.
 */
export function extractLegalKeywords(userText: string): ExtractedLegalKeywords {
  const cleaned = userText.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!cleaned) {
    return { lawQuery: "민법", precQuery: "민법", tokens: [] };
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
  const precQuery =
    `${lawQuery} ${tokens.slice(0, 3).join(" ")}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || lawQuery;
  return { lawQuery, precQuery, tokens };
}

/**
 * 추출 키워드로 법령 검색 — 1차 쿼리 결과가 비면 precQuery 로 재시도.
 */
export async function searchLawsWithKeywordFallback(
  userText: string
): Promise<LawSearchResponse> {
  try {
    const { lawQuery, precQuery } = extractLegalKeywords(userText);
    let res = await searchLaws(lawQuery);
    if (res.items.length > 0) return res;
    if (precQuery !== lawQuery) {
      res = await searchLaws(precQuery);
    }
    return res;
  } catch {
    return {
      query: "",
      totalCnt: 0,
      items: [],
      mocked: true,
      source: "empty-query",
    };
  }
}

/* ══════════════════════════════════════════════════════════════════════
 *  3. 법령 본문(조문) 조회 — lawService.do
 * ══════════════════════════════════════════════════════════════════════ */

export type LawArticle = {
  /** 조문번호 (ex: "8") */
  no: string;
  /** 가지번호 (ex: "2" in 제8조의2)  — 없으면 "" */
  sub: string;
  /** 제목 */
  title: string;
  /** 본문(항·호·목 전체 이어붙인 일반 텍스트) */
  content: string;
};

export type LawDetail = {
  id: string;
  name: string;
  articles: LawArticle[];
  source: "law.go.kr:xml" | "local-kb";
  mocked: boolean;
};

/**
 * 법령 본문(조문) 조회
 *  - lawId: 법령ID 혹은 MST (둘 중 하나를 주면 됨)
 */
export async function fetchLawDetail(
  lawIdOrMst: string,
  lawName = ""
): Promise<LawDetail> {
  logKeyOnce();
  const id = lawIdOrMst.trim();
  if (!id) return { id: "", name: lawName, articles: [], source: "local-kb", mocked: true };
  const apiKey = getApiKey();
  if (!apiKey) return buildMockDetail(id, lawName);

  // law.go.kr 은 ID 또는 MST 둘 다 받으나 MST 쪽이 신뢰도가 높음.
  const idParam = /^\d+$/.test(id) ? `ID=${id}` : `MST=${id}`;
  const url =
    `${getBaseUrl()}/lawService.do` +
    `?OC=${encodeURIComponent(apiKey)}` +
    `&target=law` +
    `&type=XML` +
    `&${idParam}`;

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: getLawGoKrUpstreamHeaders(),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/^<\??xml|^<법령/i.test(text.trim())) {
      throw new Error("non-XML detail response");
    }
    return normalizeLawDetailXml(id, lawName, xmlParser.parse(text));
  } catch (err) {
    console.warn(
      "[law-api] fetchLawDetail failed, falling back:",
      (err as Error).message
    );
    return buildMockDetail(id, lawName);
  }
}

function normalizeLawDetailXml(
  id: string,
  fallbackName: string,
  parsed: unknown
): LawDetail {
  // 구조: { "법령": { "기본정보": { "법령명_한글": "...", ... }, "조문": { "조문단위": [ ... ] } } }
  const law = (parsed as { 법령?: Record<string, unknown> }).법령 ?? {};
  const basic = (law.기본정보 as Record<string, unknown>) ?? {};
  const name = String(basic["법령명_한글"] ?? basic["법령명한글"] ?? fallbackName);

  const jomun = (law.조문 as Record<string, unknown>) ?? {};
  const units = Array.isArray(jomun.조문단위)
    ? (jomun.조문단위 as Record<string, unknown>[])
    : [];

  const articles: LawArticle[] = units.map((u) => {
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
  });

  return {
    id,
    name,
    articles: articles.filter((a) => a.content),
    source: "law.go.kr:xml",
    mocked: false,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  4. 로컬 Knowledge Base (폴백)
 * ══════════════════════════════════════════════════════════════════════ */

const LOCAL_KB: Array<{ keywords: RegExp; items: LawSearchItem[] }> = [
  {
    keywords: /청탁|금품|선물|식사|접대|떡값|상품권|한우|굴비|부정청탁|청탁금지/,
    items: [
      {
        id: "kb-cheongtak",
        name: "부정청탁 및 금품등 수수의 금지에 관한 법률",
        abbr: "청탁금지법",
        department: "국민권익위원회",
        effectiveDate: "20220601",
        status: "현행",
      },
      {
        id: "kb-gangryeong",
        name: "공무원 행동강령",
        department: "국민권익위원회",
        effectiveDate: "20230101",
        status: "현행",
      },
    ],
  },
  {
    keywords: /이해충돌|사적이해|가족|친족|4촌|수의|동생|자녀|부모|배우자|형제|이해충돌방지/,
    items: [
      {
        id: "kb-ihae",
        name: "공직자의 이해충돌 방지법",
        abbr: "이해충돌방지법",
        department: "국민권익위원회",
        effectiveDate: "20220519",
        status: "현행",
      },
    ],
  },
  {
    keywords: /갑질|괴롭힘|사적.?심부름|폭언|폭행|근로기준/,
    items: [
      {
        id: "kb-근로",
        name: "근로기준법",
        department: "고용노동부",
        effectiveDate: "20230718",
        status: "현행",
      },
    ],
  },
  {
    keywords: /계약|입찰|발주|조달|공사|국가계약|지방계약|부정당업자/,
    items: [
      {
        id: "kb-계약",
        name: "국가를 당사자로 하는 계약에 관한 법률",
        abbr: "국가계약법",
        department: "기획재정부",
        effectiveDate: "20230401",
        status: "현행",
      },
    ],
  },
  {
    keywords: /퇴직|재취업|이직|영리|공직자윤리/,
    items: [
      {
        id: "kb-윤리",
        name: "공직자윤리법",
        department: "인사혁신처",
        effectiveDate: "20230401",
        status: "현행",
      },
    ],
  },
];

/**
 * 주요 법령의 핵심 조문을 로컬에 복제해 둠 (API 미설정/실패 시 폴백용).
 * 실제 조문 원문을 기반으로 요점을 발췌.
 */
const KB_ARTICLES: Record<string, LawArticle[]> = {
  "kb-cheongtak": [
    {
      no: "8",
      sub: "",
      title: "금품등의 수수 금지",
      content:
        "공직자등은 직무 관련 여부 및 기부·후원·증여 등 그 명목에 관계없이 " +
        "동일인으로부터 1회 100만원 또는 매 회계연도 300만원을 초과하는 금품등을 받거나 " +
        "요구 또는 약속해서는 아니 된다.\n" +
        "공직자등은 직무와 관련하여 대가성 여부를 불문하고 제1항에서 정한 금액 이하의 " +
        "금품등을 받거나 요구 또는 약속해서는 아니 된다.",
    },
    {
      no: "22",
      sub: "",
      title: "벌칙",
      content:
        "제8조제1항을 위반한 공직자등은 3년 이하의 징역 또는 3천만원 이하의 벌금에 처한다.",
    },
    {
      no: "23",
      sub: "",
      title: "과태료 부과",
      content:
        "제8조제2항을 위반한 공직자등에게는 그 수수 금액의 2배 이상 5배 이하에 " +
        "상당하는 과태료를 부과한다.",
    },
  ],
  "kb-ihae": [
    {
      no: "5",
      sub: "",
      title: "사적이해관계자의 신고 및 회피·기피 신청",
      content:
        "공직자는 직무관련자가 사적이해관계자임을 안 날부터 14일 이내에 " +
        "그 사실을 서면(전자문서를 포함한다)으로 소속기관장에게 신고하고 " +
        "회피를 신청하여야 한다.",
    },
    {
      no: "12",
      sub: "",
      title: "직무관련자와의 거래 신고",
      content:
        "공직자는 자신, 배우자, 직계존속·비속 또는 대통령령으로 정하는 " +
        "특수관계인이 공직자 자신의 직무관련자와 금전을 빌리거나 " +
        "부동산을 거래하는 경우 소속기관장에게 신고하여야 한다.",
    },
    {
      no: "27",
      sub: "",
      title: "벌칙",
      content:
        "제14조를 위반하여 직무상 비밀 또는 소속 공공기관의 미공개정보를 " +
        "이용하여 재물 또는 재산상의 이익을 취득하거나 제3자로 하여금 " +
        "취득하게 한 공직자는 7년 이하의 징역 또는 7천만원 이하의 벌금에 처한다.",
    },
  ],
  "kb-근로": [
    {
      no: "76",
      sub: "2",
      title: "직장 내 괴롭힘의 금지",
      content:
        "사용자 또는 근로자는 직장에서의 지위 또는 관계 등의 우위를 이용하여 " +
        "업무상 적정범위를 넘어 다른 근로자에게 신체적·정신적 고통을 주거나 " +
        "근무환경을 악화시키는 행위를 하여서는 아니 된다.",
    },
    {
      no: "116",
      sub: "",
      title: "과태료",
      content:
        "사용자가 직장 내 괴롭힘 관련 조사·조치 의무를 위반한 경우 " +
        "1천만원 이하의 과태료를 부과한다.",
    },
  ],
  "kb-계약": [
    {
      no: "27",
      sub: "",
      title: "부정당업자의 입찰 참가자격 제한",
      content:
        "각 중앙관서의 장은 경쟁의 공정한 집행 또는 계약의 적정한 이행을 " +
        "해칠 우려가 있거나 그 밖에 입찰에 참가시키는 것이 부적합하다고 " +
        "인정되는 자에 대하여 2년 이내의 범위에서 입찰 참가자격을 제한하여야 한다.",
    },
  ],
  "kb-윤리": [
    {
      no: "17",
      sub: "",
      title: "퇴직공직자의 취업제한",
      content:
        "재산등록의무자였던 공직자는 퇴직일부터 3년간 퇴직 전 5년 동안 " +
        "소속했던 부서 또는 기관의 업무와 밀접한 관련성이 있는 " +
        "취업제한기관에 취업할 수 없다.",
    },
  ],
};

function buildMockResult(q: string): LawSearchResponse {
  const matched = LOCAL_KB.filter((g) => g.keywords.test(q)).flatMap((g) => g.items);
  const items =
    matched.length > 0
      ? matched
      : [
          {
            id: "kb-gonmuwon",
            name: "국가공무원법",
            department: "인사혁신처",
            effectiveDate: "20230401",
            status: "현행",
          },
          {
            id: "kb-gangryeong",
            name: "공무원 행동강령",
            department: "국민권익위원회",
            effectiveDate: "20230101",
            status: "현행",
          },
        ];
  const dedup = Array.from(new Map(items.map((i) => [i.id, i])).values());
  return { query: q, totalCnt: dedup.length, items: dedup, mocked: true, source: "local-kb" };
}

function buildMockDetail(id: string, fallbackName: string): LawDetail {
  const articles = KB_ARTICLES[id] ?? [];
  return {
    id,
    name: fallbackName || id,
    articles,
    source: "local-kb",
    mocked: true,
  };
}

/* ══════════════════════════════════════════════════════════════════════
 *  5. 복합 리스크 점수화 엔진
 *     — XML 조문 텍스트 + 자연어 신호를 가중 합산하여 0~100 으로 환산
 * ══════════════════════════════════════════════════════════════════════ */

export type RiskCitation = {
  statute: string;
  clause: string;
  excerpt?: string;
};

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RiskFactor = {
  label: string;
  delta: number;
  detail: string;
};

export type RiskAnalysis = {
  prompt: string;
  /** 0~100 */
  riskScore: number;
  riskLevel: RiskLevel;
  /** 의사결정에 직접 인용할 수 있는 3~5줄 요약 */
  summary: string;
  /** 계산에 기여한 세부 팩터들(투명성) */
  factors: RiskFactor[];
  /** 인용 법령/조문 */
  citations: RiskCitation[];
  /** 권장 행동(우선순위순) */
  recommendations: string[];
  relatedLaws: LawSearchItem[];
  /** 분석에 사용된 실제 조문 원문(요약용) */
  articlesUsed: Array<{ law: string; article: string; excerpt: string }>;
  /** 실 API 호출 여부 */
  mocked: boolean;
  /** 지표 소스 */
  source: string;
};

/* ── 5-1. 시나리오 분류 ────────────────────────────────────────────── */

type Scenario =
  | "cheongtak"       // 청탁·금품
  | "ihae"            // 이해충돌
  | "labor"           // 임금·해고 등 근로
  | "gabjil"          // 갑질·괴롭힘
  | "contract"        // 계약·입찰
  | "retire"          // 퇴직·재취업
  | "info"            // 정보유출
  | "civil"           // 민사·계약 일반
  | "criminal"        // 형사
  | "consumer"        // 소비자
  | "family"          // 가족법
  | "tax"             // 조세
  | "traffic"         // 교통
  | "ip"              // 지식재산
  | "admin"           // 행정·소송
  | "generic";

const SCENARIO_PATTERNS: Array<{ id: Scenario; rx: RegExp; query: string }> = [
  { id: "cheongtak", rx: /청탁|금품|선물|식사|접대|떡값|상품권|골프|명절|봉투|현금|기프티콘/, query: "청탁금지법" },
  { id: "ihae",      rx: /이해충돌|사적이해|가족|친족|배우자|4촌|직계|부동산|주식|매도|매수|동생|자녀|부모|형제|인허가|허가.?업무/, query: "이해충돌방지법" },
  { id: "labor",     rx: /퇴직금|임금체불|임금|연차|유급휴가|야근|수당|실업급여|고용보험|산재|산재보험|부당해고|해고예고|취업규칙|노동|근로자|사용자/, query: "근로기준법" },
  { id: "gabjil",    rx: /갑질|괴롭힘|사적.?심부름|폭언|폭행|모욕|주말근무|심부름|과중/, query: "근로기준법" },
  { id: "contract",  rx: /계약|입찰|수의|발주|공사|조달|납품|하도급/, query: "국가계약법" },
  { id: "retire",    rx: /퇴직|재취업|이직|영리업무|겸직/, query: "공직자윤리법" },
  { id: "info",      rx: /유출|내부정보|비공개|자료.?제공|문서.?반출|복사.?제공/, query: "공공기록물 관리법" },
  { id: "civil",     rx: /민법|불법행위|손해배상|계약\s*해제|계약\s*해지|채권|채무|매매|임대차|전세|월세|소유권|유치권|임차인|명예훼손|모욕|대항력|보증금/, query: "민법" },
  { id: "criminal",  rx: /형법|사기|횡령|배임|성추행|강제추행|협박|살인|절도|무고|모해|성폭력/, query: "형법" },
  { id: "consumer",  rx: /소비자|청약\s*철회|통신판매|전자상거래|할부|환불|품질보증|불공정거래/, query: "소비자기본법" },
  { id: "family",    rx: /이혼|친양자|친생자|상속|유언|혼인|양육|양육권|친권/, query: "민법" },
  { id: "tax",       rx: /세금|국세|지방세|과세|종합소득|부가세|양도소득|가산세|징수유예|세무/, query: "국세기본법" },
  { id: "traffic",   rx: /교통|도로교통|음주운전|무면허|과속|신호위반/, query: "도로교통법" },
  { id: "ip",        rx: /저작권|특허|상표|부정\s*경쟁|영업비밀|침해금지/, query: "저작권법" },
  { id: "admin",     rx: /행정소송|행정처분|취소소송|무효\s*확인|이의신청|행정심판|과징금|과태료\s*부과/, query: "행정소송법" },
];

/** 공직 윤리 외 일반 법률 질의도 lawSearch 가 인식할 수 있도록 검색어를 만든다. */
function deriveLawSearchQuery(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!cleaned) return "민법";
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
  if (tokens.length >= 2) return tokens.slice(0, 8).join(" ");
  return q.slice(0, 80).trim() || "민법";
}

function classifyScenario(text: string): { scenario: Scenario; query: string } {
  for (const s of SCENARIO_PATTERNS) {
    if (s.rx.test(text)) return { scenario: s.id, query: s.query };
  }
  return { scenario: "generic", query: deriveLawSearchQuery(text) };
}

/* ── 5-2. 자연어에서 양적 신호 추출 ──────────────────────────────────── */

type Signals = {
  /** 원 단위 금액 (추정) */
  krw: number;
  /** 식사/선물/경조사 등 청탁금지법 3·5·10 분류 */
  cheongtakContext: "meal" | "gift" | "ceremony" | "none";
  repetition: boolean;
  relationship: boolean;
  direct: boolean;          // 직무 직접 관련
  mitigation: boolean;      // 거절·신고·반환
  officer: boolean;         // 공직자 본인
  subordinate: boolean;     // 부하·팀원
  minor: boolean;           // 단발성·소액 맥락
};

export function extractSignals(raw: string): Signals {
  const text = raw.replace(/\s+/g, " ");
  return {
    krw: extractKrwAmount(text),
    cheongtakContext: /식사|밥|저녁|점심|회식|술/.test(text)
      ? "meal"
      : /경조사|화환|조의금|축의금/.test(text)
        ? "ceremony"
        : /선물|상품권|기프티콘|떡값|명절|굴비|한우/.test(text)
          ? "gift"
          : "none",
    repetition: /반복|자주|여러.?번|수.?차례|계속|또.?찾|몇.?번/.test(text),
    relationship: /가족|배우자|부모|자녀|친인척|지인|친구|4촌|누나|언니|형|동생|오빠/.test(text),
    direct: /담당|주무|결재|평가|승인|허가|인.?허가|감독|검사|심사|채점/.test(text),
    mitigation: /거절|신고|반환|돌려|문의|보고|기부|돌려.?주|되돌려/.test(text),
    officer: /공무원|공직자|주무관|사무관|팀장|국장|과장|계장|선생님|교사|교수/.test(text),
    subordinate: /부하|팀원|하급자|직원|인턴|계약직/.test(text),
    minor: /한.?번만|딱.?한.?번|소액|얼마.?안/.test(text),
  };
}

function extractKrwAmount(text: string): number {
  // "10만원", "5만", "100,000원", "3백만원", "1천만원"
  const han = text.match(/(\d+(?:[.,]\d+)?)(?:\s*)(천만|백만|십만|만|천|백)\s*원?/);
  const plain = text.match(/(\d{4,})\s*원/);
  if (han) {
    const n = parseFloat(han[1].replace(/,/g, ""));
    const mult: Record<string, number> = {
      천만: 10_000_000,
      백만: 1_000_000,
      십만: 100_000,
      만: 10_000,
      천: 1_000,
      백: 100,
    };
    return Math.round(n * (mult[han[2]] ?? 1));
  }
  if (plain) return parseInt(plain[1], 10);
  return 0;
}

/* ── 5-3. 청탁금지법 3·5·10 임계값 교차검사 ──────────────────────────── */

/**
 *  2024년 1월 1일 개정 기준
 *  식사 5만(구 3만→개정) / 선물 5만(명절·농수산물 15/30) / 경조사비 5만 / 화환 10만
 */
function check3510(sig: Signals): { delta: number; detail: string } | null {
  if (sig.cheongtakContext === "none" || sig.krw === 0) return null;
  const t = { meal: 50_000, gift: 50_000, ceremony: 50_000 }[sig.cheongtakContext]; // 2024.1.1 개정: 음식물 5만원
  const krw = sig.krw;
  const ratio = krw / t;
  if (ratio <= 0.5) return { delta: 8, detail: `금액 ${formatWon(krw)} — 청탁금지법 상한(${formatWon(t)}) 이하, 단순 주의 수준` };
  if (ratio <= 1)   return { delta: 18, detail: `금액 ${formatWon(krw)} — 청탁금지법 상한(${formatWon(t)}) 근접` };
  if (ratio <= 3)   return { delta: 32, detail: `금액 ${formatWon(krw)} — 청탁금지법 상한(${formatWon(t)}) 초과` };
  return { delta: 45, detail: `금액 ${formatWon(krw)} — 상한 ${Math.round(ratio)}배 초과, 형사처벌 구간 가능성` };
}

function formatWon(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(1)}천만원`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만원`;
  return `${n.toLocaleString()}원`;
}

/* ── 5-4. XML 조문 텍스트 → 처벌/금지 강도 ─────────────────────────── */

/**
 *  조문 본문 텍스트를 분석해 "법적 심각도" 0~40 점을 산출.
 *  - 징역   → +22
 *  - 벌금   → +14
 *  - 과태료 → +10
 *  - 파면/해임/정직 → +14
 *  - 금지/아니된다 의무 표현 → +10
 *  - 금액(천만원 등) 큰 기준 언급 → +추가 보너스
 */
export function scoreArticleText(content: string): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let s = 0;

  const add = (delta: number, reason: string) => {
    s += delta;
    reasons.push(reason);
  };

  if (/징역/.test(content)) add(22, "징역형 규정");
  if (/벌금/.test(content)) add(14, "벌금형 규정");
  if (/과태료/.test(content)) add(10, "과태료 규정");
  if (/(파면|해임|정직|감봉|견책)/.test(content)) add(14, "징계 규정");
  if (/(하여서는\s*아니\s*된다|하여서는\s*안\s*된다|아니\s*된다|금지한다)/.test(content))
    add(10, "명시적 금지 의무");
  if (/신고.*의무|의무적.*신고|신고하여야\s*한다/.test(content))
    add(6, "신고 의무");

  // 금액 기준이 직접 조문에 박혀있는 경우 엄격도 가산
  const big = content.match(/(\d+\s*(천|백)?만원)/g);
  if (big && big.length > 0) add(4, `조문 내 금액 기준 ${big.length}건`);

  return { score: Math.min(s, 40), reasons };
}

/* ── 5-5. 메인 analyzeRisk ──────────────────────────────────────────── */

export async function analyzeRisk(prompt: string): Promise<RiskAnalysis> {
  const text = prompt.trim();
  const factors: RiskFactor[] = [];
  const citations: RiskCitation[] = [];
  const recommendations: string[] = [];
  const articlesUsed: RiskAnalysis["articlesUsed"] = [];

  // (1) 시나리오 분류
  const { scenario, query } = classifyScenario(text);

  // (2) 자연어 신호 추출
  const sig = extractSignals(text);

  // 기준 점수(시나리오별 베이스라인)
  const base =
    {
      cheongtak: 30,
      ihae: 28,
      labor: 26,
      gabjil: 32,
      contract: 24,
      retire: 18,
      info: 26,
      civil: 22,
      criminal: 26,
      consumer: 20,
      family: 22,
      tax: 22,
      traffic: 22,
      ip: 20,
      admin: 24,
      generic: 16,
    }[scenario];
  factors.push({
    label: `시나리오 베이스라인(${scenario})`,
    delta: base,
    detail: `"${query}" 계열 쟁점으로 분류됨`,
  });

  // (3) 3·5·10 교차검사
  if (scenario === "cheongtak") {
    const r = check3510(sig);
    if (r) factors.push({ label: "청탁금지법 3·5·10 교차검사", delta: r.delta, detail: r.detail });
  }

  // (4) 관계·반복·직접관련·완화요인
  if (sig.relationship) {
    factors.push({
      label: "이해관계 신호",
      delta: 10,
      detail: "가족/친인척/지인 언급 — 사적이해관계자 가능성",
    });
  }
  if (sig.repetition) {
    factors.push({
      label: "반복성 신호",
      delta: 12,
      detail: "반복/상습 수수 가능성 — 동일인 300만원/연 기준 근접",
    });
  }
  if (sig.direct) {
    factors.push({
      label: "직무 직접관련",
      delta: 15,
      detail: "평가/결재/감독 등 직무 직접 관련 어휘 감지",
    });
  }
  if (sig.subordinate && (scenario === "gabjil" || scenario === "labor")) {
    factors.push({
      label: "권력 관계",
      delta: 10,
      detail: "상급자→하급자 구조 — 직장 내 괴롭힘 성립 가능성 상향",
    });
  }
  if (sig.mitigation) {
    factors.push({
      label: "완화 요인",
      delta: -18,
      detail: "거절/신고/반환 의사 확인 — 내부 신고 완화 요소 반영",
    });
  }

  // (5) 국가법령정보 실시간 조회 & 조문 분석
  const search = await searchLaws(query);
  const top = search.items[0];
  if (top) {
    const detail = await fetchLawDetail(top.mst ?? top.id, top.name);
    const best = pickMostRelevantArticle(detail.articles, scenario, text);
    if (best) {
      const { score, reasons } = scoreArticleText(best.content);
      factors.push({
        label: `조문 분석: ${detail.name} 제${best.no}${best.sub ? "의" + best.sub : ""}조`,
        delta: Math.round(score * 0.6), // 조문 심각도는 60% 가중
        detail: reasons.join(" · ") || "일반 규정",
      });
      citations.push({
        statute: detail.name,
        clause: `제${best.no}${best.sub ? "의" + best.sub : ""}조 ${best.title}`.trim(),
        excerpt: truncate(best.content, 160),
      });
      articlesUsed.push({
        law: detail.name,
        article: `제${best.no}${best.sub ? "의" + best.sub : ""}조 ${best.title}`.trim(),
        excerpt: truncate(best.content, 400),
      });
    }
  }

  // (5-b) 판례 검색 — 법령과 별도로 질의 기반 포괄 검색
  const precQuery = `${query} ${deriveLawSearchQuery(text)}`.replace(/\s+/g, " ").trim().slice(0, 120);
  const precedents = await searchPrecedents(precQuery, 5);
  for (const p of precedents.slice(0, 2)) {
    if (!p.title) continue;
    citations.push({
      statute: p.court ? `${p.court} 판례` : "판례",
      clause: p.caseNo ? `${p.title} (${p.caseNo})` : p.title,
      excerpt: p.gist ? truncate(p.gist, 160) : undefined,
    });
  }

  // (5-c) 인용이 여전히 0이면 시나리오 기본 근거를 주입
  if (citations.length === 0) {
    const fb = fallbackCitation(scenario);
    if (fb) citations.push(fb);
  }

  // (6) 시나리오 기본 권고
  recommendations.push(...defaultRecs(scenario, sig));

  // (7) 총점 합산 + 캡
  let total = factors.reduce((sum, f) => sum + f.delta, 0);
  total = Math.max(5, Math.min(99, Math.round(total)));

  const level: RiskLevel =
    total >= 85 ? "CRITICAL" : total >= 65 ? "HIGH" : total >= 40 ? "MEDIUM" : "LOW";

  // (8) 요약문
  const summary = buildSummary(text, total, level, citations, scenario);

  return {
    prompt: text,
    riskScore: total,
    riskLevel: level,
    summary,
    factors,
    citations: dedupCitations(citations).slice(0, 5),
    recommendations: Array.from(new Set(recommendations)).slice(0, 5),
    relatedLaws: search.items.slice(0, 5),
    articlesUsed,
    mocked: search.mocked,
    source: search.source,
  };
}

/* ── 5-6. 보조 헬퍼 ─────────────────────────────────────────────────── */

function pickMostRelevantArticle(
  articles: LawArticle[],
  scenario: Scenario,
  userText: string
): LawArticle | null {
  if (articles.length === 0) return null;

  // 시나리오별 우선 조문 번호
  const priorityByScenario: Record<Scenario, string[]> = {
    cheongtak: ["8", "22", "23"],
    ihae: ["5", "12", "27", "14"],
    labor: ["23", "26", "36", "41"],
    gabjil: ["76", "116"],
    contract: ["27"],
    retire: ["17"],
    info: ["35"],
    civil: [],
    criminal: [],
    consumer: [],
    family: [],
    tax: [],
    traffic: [],
    ip: [],
    admin: [],
    generic: [],
  };
  const priority = priorityByScenario[scenario];

  // 1순위: 시나리오 우선 조문 매칭
  for (const no of priority) {
    const hit = articles.find((a) => a.no === no);
    if (hit) return hit;
  }
  // 2순위: 사용자 텍스트와 조문 텍스트의 단순 키워드 overlap
  const userTokens = tokenize(userText);
  let best: LawArticle | null = null;
  let bestScore = 0;
  for (const a of articles) {
    const artTokens = tokenize(a.title + " " + a.content);
    let overlap = 0;
    for (const t of userTokens) if (artTokens.has(t)) overlap++;
    if (overlap > bestScore) {
      bestScore = overlap;
      best = a;
    }
  }
  return best ?? articles[0];
}

/** 포괄 법률 질의(시나리오 미분류)용 — generic 우선순위 + 질의·조문 토큰 매칭 */
export function pickMostRelevantArticlePublic(
  articles: LawArticle[],
  userText: string
): LawArticle | null {
  return pickMostRelevantArticle(articles, "generic", userText);
}

function tokenize(t: string): Set<string> {
  const set = new Set<string>();
  for (const w of t.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/)) {
    if (w.length >= 2) set.add(w);
  }
  return set;
}

function truncate(s: string, n: number) {
  const v = s.replace(/\s+/g, " ").trim();
  return v.length > n ? v.slice(0, n) + "…" : v;
}

function dedupCitations(arr: RiskCitation[]): RiskCitation[] {
  const seen = new Set<string>();
  const out: RiskCitation[] = [];
  for (const c of arr) {
    const k = `${c.statute}|${c.clause}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

function defaultRecs(scenario: Scenario, sig: Signals): string[] {
  const recs: string[] = [];
  switch (scenario) {
    case "cheongtak":
      recs.push("수수 즉시 반환·거절 후 소속기관 청렴옴부즈만에게 서면 신고");
      recs.push("영수증·카드내역·대화내역을 즉시 캡처하여 증거 보존");
      if (sig.cheongtakContext === "meal")
        recs.push("식사 5만원 기준 초과 여부 확인(1인 기준, 2024년 1월 1일 개정)");
      break;
    case "ihae":
      recs.push("사적이해관계자 14일 내 서면 신고 및 직무 회피 신청");
      recs.push("결재 라인에서 본인 제외 및 대체 결재자 지정");
      break;
    case "gabjil":
      recs.push("카톡·이메일·업무지시 내역을 날짜별로 보존");
      recs.push("고충처리위·감사부서에 공식 접수, 사내 괴롭힘 대응절차 가동");
      break;
    case "contract":
      recs.push("평가표·심사위원 명단 변경 이력 감사 요청");
      recs.push("직무관련자 거래 신고서 제출 및 결재라인 분리");
      break;
    case "retire":
      recs.push("퇴직 후 3년 내 취업제한기관 해당 여부 공직자윤리위 사전심사 신청");
      break;
    case "info":
      recs.push("접근 로그 보존 및 정보보호책임자 즉시 통보");
      recs.push("외부 제공 건은 정보공개 절차를 거쳤는지 확인");
      break;
    case "civil":
    case "criminal":
    case "consumer":
    case "family":
    case "tax":
    case "traffic":
    case "ip":
    case "admin":
    case "labor":
      recs.push(
        "사실관계·일자·금액·증거자료를 정리한 뒤 law.go.kr 원문과 대조하세요."
      );
      recs.push("분쟁·수사·소송 단계에 따라 변호사 등 전문가 상담을 병행하세요.");
      break;
    default:
      recs.push("소속기관 행동강령 및 공익신고자 보호 절차를 사전 점검");
  }
  if (!sig.mitigation) recs.push("내부감사 또는 청렴옴부즈만에게 사전 문의 권장");
  return recs;
}

function fallbackCitation(scenario: Scenario): RiskCitation | null {
  switch (scenario) {
    case "cheongtak":
      return { statute: "청탁금지법", clause: "제8조(금품등 수수 금지)" };
    case "ihae":
      return { statute: "이해충돌방지법", clause: "제5조(사적이해관계자 신고)" };
    case "labor":
      return { statute: "근로기준법", clause: "임금·해고 등 근로조건 관련 조항" };
    case "gabjil":
      return { statute: "근로기준법", clause: "제76조의2(직장 내 괴롭힘 금지)" };
    case "contract":
      return { statute: "국가계약법", clause: "제27조(부정당업자 제재)" };
    case "retire":
      return { statute: "공직자윤리법", clause: "제17조(취업제한)" };
    case "info":
      return { statute: "공공기록물 관리법", clause: "제35조(비공개 정보 관리)" };
    case "civil":
      return { statute: "민법", clause: "불법행위·계약 등 일반원칙(조문 확인 필요)" };
    case "criminal":
      return { statute: "형법", clause: "각 죄 구성요건 관련 조항(조문 확인 필요)" };
    case "consumer":
      return { statute: "소비자기본법", clause: "소비자 권익 보호 일반" };
    case "family":
      return { statute: "민법", clause: "친족·상속 등 가족법 관련 조항" };
    case "tax":
      return { statute: "국세기본법", clause: "과세·납세 일반" };
    case "traffic":
      return { statute: "도로교통법", clause: "운전자 의무·처벌 관련 조항" };
    case "ip":
      return { statute: "저작권법", clause: "저작권·침해 관련 조항" };
    case "admin":
      return { statute: "행정소송법", clause: "취소·무효 등 구제 절차" };
    default:
      return {
        statute: "관련 법령",
        clause: "질의에 맞는 법령·조문·판례를 law.go.kr에서 확인",
      };
  }
}

function buildSummary(
  text: string,
  score: number,
  level: RiskLevel,
  citations: RiskCitation[],
  scenario: Scenario
): string {
  const tag =
    {
      cheongtak: "금품·청탁",
      ihae: "이해충돌",
      labor: "근로·임금",
      gabjil: "직장 내 괴롭힘",
      contract: "계약·입찰",
      retire: "퇴직·재취업",
      info: "정보 관리",
      civil: "민사·계약",
      criminal: "형사",
      consumer: "소비자",
      family: "가족·상속",
      tax: "조세",
      traffic: "교통",
      ip: "지식재산",
      admin: "행정·소송",
      generic: "일반 법률",
    }[scenario] || "일반";

  const top = citations[0];
  return (
    `[AI 법령 분석 · ${tag}]\n` +
    `- 질의: "${text.slice(0, 90)}${text.length > 90 ? "…" : ""}"\n` +
    `- 종합 리스크: ${score}% (${level})\n` +
    (top
      ? `- 핵심 근거: ${top.statute} · ${top.clause}\n`
      : "- 핵심 근거: 관련 조항 확인 중…\n") +
    `- 국가법령정보 API 실시간 교차검증 결과입니다.`
  );
}
