/**
 * lib/law-api-client.ts
 * ─────────────────────────────────────────────────────────────────────
 * 브라우저 전용 law.go.kr 클라이언트.
 * 서버 IP 우회 목적 — 사용자 브라우저 IP 로 직접 호출.
 * DOMParser / URLSearchParams 사용 → 브라우저 환경에서만 호출할 것.
 */

const OC = process.env.NEXT_PUBLIC_LAW_API_KEY ?? "ethics";
const BASE = "https://www.law.go.kr/DRF";

/* ── 공통 타입 ──────────────────────────────────────────────────────── */

export type ClientPrecedent = {
  caseNo: string;
  court: string;
  date: string;
  gist: string;
  outcome: "승소" | "패소";
  outcomeKeyword: string;
};

export type ClientLawItem = {
  id: string;
  mst?: string;
  name: string;
  department?: string;
  effectiveDate?: string;
  status?: string;
};

export type ClientCitation = {
  statute: string;
  clause: string;
  excerpt: string;
};

/* ── 내부 헬퍼 ──────────────────────────────────────────────────────── */

function extractClientKeywords(text: string): string {
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 200);
  const filler =
    /^(저는|저희|제가|혹시|질문입니다|문의드|여쭤|알고\s*싶|궁금합니다|도와)/i;
  const q = cleaned.replace(filler, "").trim() || cleaned;
  const stop = new Set([
    "하는데", "있는데", "경우에", "있을까", "있나요",
    "되나요", "될까요", "인가요", "맞나요",
  ]);
  const tokens = q
    .split(/[\s,.;，。!?？]+/)
    .filter((w) => w.length >= 2 && !stop.has(w))
    .slice(0, 8);
  return (tokens.join(" ") || q).slice(0, 120);
}

function detectClientOutcome(text: string): { outcome: "승소" | "패소"; keyword: string } {
  const wonPatterns = ["승소", "인용", "파기환송", "무죄", "파기자판"];
  for (const k of wonPatterns) {
    if (text.includes(k)) return { outcome: "승소", keyword: k };
  }
  const lostPatterns = ["패소", "기각", "각하", "유죄", "상고기각"];
  for (const k of lostPatterns) {
    if (text.includes(k)) return { outcome: "패소", keyword: k };
  }
  return { outcome: "패소", keyword: "판단문구미확인" };
}

/* ── 판례 검색 (브라우저 직접 호출) ────────────────────────────────── */

export async function searchPrecedentsClient(
  userText: string,
  display = 10
): Promise<ClientPrecedent[]> {
  try {
    const keywords = extractClientKeywords(userText);
    const params = new URLSearchParams({
      OC,
      target: "prec",
      type: "XML",
      query: keywords,
      display: String(Math.min(30, Math.max(1, display))),
    });
    const res = await fetch(`${BASE}/lawSearch.do?${params}`, {
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    if (!res.ok) return [];
    const rawXml = await res.text();
    const xmlDoc = new DOMParser().parseFromString(rawXml, "application/xml");
    const nodes = Array.from(xmlDoc.getElementsByTagName("prec")).slice(0, display);
    return nodes.map((p) => {
      const title = p.getElementsByTagName("사건명")[0]?.textContent ?? "";
      const { outcome, keyword } = detectClientOutcome(title);
      return {
        caseNo: p.getElementsByTagName("사건번호")[0]?.textContent ?? "미상",
        court: p.getElementsByTagName("법원명")[0]?.textContent ?? "대법원",
        date: p.getElementsByTagName("선고일자")[0]?.textContent ?? "",
        gist: title.slice(0, 160) || "사건명 미상",
        outcome,
        outcomeKeyword: keyword,
      };
    });
  } catch {
    return [];
  }
}

/* ── 법령 검색 (브라우저 직접 호출) ────────────────────────────────── */

export async function searchLawsClient(
  query: string,
  display = 5
): Promise<ClientLawItem[]> {
  try {
    const keywords = extractClientKeywords(query);
    const params = new URLSearchParams({
      OC,
      target: "law",
      type: "XML",
      query: keywords,
      display: String(Math.min(10, Math.max(1, display))),
    });
    const res = await fetch(`${BASE}/lawSearch.do?${params}`, {
      headers: { Accept: "application/xml,text/xml,*/*" },
    });
    if (!res.ok) return [];
    const rawXml = await res.text();
    const xmlDoc = new DOMParser().parseFromString(rawXml, "application/xml");
    return Array.from(xmlDoc.getElementsByTagName("law"))
      .slice(0, display)
      .map((n, i) => ({
        id:
          n.getElementsByTagName("법령ID")[0]?.textContent ??
          n.getElementsByTagName("법령일련번호")[0]?.textContent ??
          `client-law-${i}`,
        mst: n.getElementsByTagName("법령MST")[0]?.textContent ?? undefined,
        name:
          n.getElementsByTagName("법령명한글")[0]?.textContent ??
          n.getElementsByTagName("법령명")[0]?.textContent ??
          "법령",
        department: n.getElementsByTagName("소관부처명")[0]?.textContent ?? undefined,
        effectiveDate: n.getElementsByTagName("시행일자")[0]?.textContent ?? undefined,
        status: n.getElementsByTagName("현행연혁코드")[0]?.textContent ?? undefined,
      }));
  } catch {
    return [];
  }
}

/* ── 판례 → 인용 변환 ───────────────────────────────────────────────── */

export function precedentsToCitations(precs: ClientPrecedent[]): ClientCitation[] {
  return precs.slice(0, 3).map((p) => ({
    statute: `${p.court} 판례`,
    clause: p.caseNo,
    excerpt: p.gist.slice(0, 160),
  }));
}
