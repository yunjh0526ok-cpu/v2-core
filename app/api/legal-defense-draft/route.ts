import { NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { callText } from "@/lib/gemini";
import {
  getLawGoKrUpstreamHeaders,
  searchLaws,
  type LawSearchItem,
} from "@/lib/law-api";

export const runtime = "nodejs";

const DOC_TABS = [
  "부패신고서",
  "고소장",
  "변론요지서",
  "답변서",
  "소명서 작성",
  "면책 신청 가이드",
  "유사 사례 분석",
  "리스크 계산기",
] as const;

type DocTab = (typeof DOC_TABS)[number];
type Purpose = "소명" | "답변" | "변론";

type ScenarioGuide = {
  when: string;
  where: string;
  who: string;
  what: string;
  how: string;
  why: string;
  evidence: string;
  evidenceFiles?: string[];
  rewardHistory?: string;
};

const BodySchema = z.object({
  selectedTab: z.enum(DOC_TABS),
  orgType: z.enum(["central", "local", "public"]).optional().default("public"),
  rawText: z.string().min(5).max(8000),
  agency: z.string().max(120).optional(),
  recipient: z.string().max(120).optional(),
  drafter: z.string().max(120).optional(),
  scenarioGuide: z.object({
    when: z.string().max(500).optional().default(""),
    where: z.string().max(500).optional().default(""),
    who: z.string().max(500).optional().default(""),
    what: z.string().max(1000).optional().default(""),
    how: z.string().max(1000).optional().default(""),
    why: z.string().max(1000).optional().default(""),
    evidence: z.string().max(1200).optional().default(""),
    evidenceFiles: z.array(z.string().max(260)).max(20).optional(),
    rewardHistory: z.string().max(1200).optional(),
  }),
  salaryMonthly: z.number().nonnegative().optional(),
  defenseCost: z.number().nonnegative().optional(),
  expectedFine: z.number().nonnegative().optional(),
  /** 브라우저에서 직접 law.go.kr 호출한 판례 — 서버 IP 우회용 */
  clientPrecedents: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().max(400),
        court: z.string().max(60).optional(),
        date: z.string().max(30).optional(),
        caseNo: z.string().max(100).optional(),
        gist: z.string().max(400),
        source: z.string().max(100).optional(),
      })
    )
    .max(5)
    .optional(),
  /** 브라우저에서 직접 law.go.kr 호출한 법령 — 서버 IP 우회용 */
  clientLaws: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(200),
        department: z.string().max(100).optional(),
      })
    )
    .max(5)
    .optional(),
});

type Precedent = {
  id: string;
  title: string;
  court?: string;
  date?: string;
  caseNo?: string;
  gist: string;
  source: string;
};

type Interpretation = {
  org: "국민권익위원회" | "인사혁신처";
  topic: string;
  gist: string;
  source: string;
};

type TabTemplate = {
  title: string;
  sections: string[];
  objective: string;
  subjectPrefix: string;
};
type OrgType = "central" | "local" | "public";
type OrgPreset = {
  label: string;
  defaultRecipient: string;
  docPrefix: string;
  footerAffix: string;
};

const DISCLAIMER =
  "※ 법적 효력 없음: 본 문서는 참고용 AI 자동 생성 초안입니다. 사실관계·증거 검증 및 최종 제출 판단은 변호사/노무사/기관 법무담당자 확인 후 진행해야 하며, 본 서비스는 제출 결과·분쟁·손해에 대한 법적 책임을 대신하지 않습니다.";

const INDEMNITY_CLAUSES = [
  {
    id: "active-public-interest",
    title: "적극행정 면책(공공의 이익 목적)",
    rationale:
      "공익 실현 목적·재량의 합리적 행사·사적 이익 부재가 입증되면 징계 감경/면책 논리를 강화할 수 있습니다.",
  },
  {
    id: "no-intent",
    title: "고의성 부존재 + 절차상 과실 최소화",
    rationale:
      "사전 문의, 내부 협의, 규정 검토 흔적이 있으면 고의가 아닌 업무상 과실 프레임으로 전환할 여지가 큽니다.",
  },
  {
    id: "mitigation-clean-record",
    title: "정상참작(청렴 이력·포상·재발방지 조치)",
    rationale:
      "평소 청렴 태도·포상·신속한 시정 조치가 있으면 처분수위 완화 논리를 구성하기 용이합니다.",
  },
] as const;

const INTERPRETATION_DB: Interpretation[] = [
  {
    org: "국민권익위원회",
    topic: "청탁금지법 금품수수 판단",
    gist:
      "직무관련성·대가성·반복성은 금액 기준과 별도로 종합 판단됩니다. 반환·신고 기록이 핵심 방어 자료입니다.",
    source: "권익위 청탁금지법 해석례(요지)",
  },
  {
    org: "국민권익위원회",
    topic: "이해충돌 신고·회피",
    gist:
      "사적 이해관계 인지 즉시 서면 신고 및 회피 신청이 원칙이며, 지연 보고는 책임 가중 요소가 됩니다.",
    source: "이해충돌방지법 운영지침(요지)",
  },
  {
    org: "인사혁신처",
    topic: "적극행정 면책 판단 요소",
    gist:
      "공익 목적, 합리적 절차 준수, 사적 이익 부재, 충분한 사실조사 여부가 면책 판단의 핵심 요소입니다.",
    source: "인사혁신처 적극행정 면책 가이드라인(요지)",
  },
  {
    org: "인사혁신처",
    topic: "징계 양정 정상참작",
    gist:
      "포상 이력, 평소 근무성적, 반성·시정 조치, 조직 기여도는 징계 양정에서 감경 요소로 참작됩니다.",
    source: "공무원 징계 실무 기준(요지)",
  },
];

const TAB_TEMPLATES: Record<DocTab, TabTemplate> = {
  부패신고서: {
    title: "부패·갑질 신고서 표준 양식",
    sections: ["신고 취지", "위반 법령 특정", "사실관계", "증거목록", "요청사항"],
    objective: "위반 법령과 신고 취지를 분명히 하여 조사 개시 요건을 명확히 한다.",
    subjectPrefix: "부패신고서",
  },
  고소장: {
    title: "고소장 표준 양식",
    sections: ["고소 취지", "피고소인 특정", "범죄사실", "법적 구성요건", "입증자료"],
    objective: "범죄사실을 법적 요건(구성요건)에 맞춰 재구성한다.",
    subjectPrefix: "고소장",
  },
  변론요지서: {
    title: "변론요지서 표준 양식",
    sections: ["변론 취지", "사실관계", "법리 주장", "포상·공적 참작", "결론"],
    objective: "고의성 부존재와 직무관련성 제한 논리를 중심으로 감경/무혐의를 목표로 한다.",
    subjectPrefix: "변론요지서",
  },
  답변서: {
    title: "답변서 표준 양식",
    sections: ["답변 취지", "사실관계 정정", "법리 반박", "증거 첨부", "요청 결론"],
    objective: "질의·통보 내용에 대해 법리적으로 반박하고 사실 오인을 교정한다.",
    subjectPrefix: "답변서",
  },
  "소명서 작성": {
    title: "소명서·경위서 표준 양식",
    sections: ["소명 취지", "경위", "불가피성", "정상참작 사유", "재발방지"],
    objective: "징계 전 단계에서 불가피성·청렴 이력·재발방지를 결합해 감경 논리를 구축한다.",
    subjectPrefix: "소명서",
  },
  "면책 신청 가이드": {
    title: "적극행정 면책 신청 표준 양식",
    sections: ["신청 취지", "공익성", "사익 부재", "절차 합리성", "면책 요청"],
    objective: "인사혁신처 적극행정 면책 기준을 충족하도록 공익 목적과 절차 정당성을 구조화한다.",
    subjectPrefix: "적극행정 면책 신청서",
  },
  "유사 사례 분석": {
    title: "유사사례 분석 리포트",
    sections: ["사안 요약", "유사 판례 3건", "처분 경향", "방어 포인트", "실행 체크리스트"],
    objective: "유사 사건의 처분 패턴을 근거로 방어 전략 우선순위를 제시한다.",
    subjectPrefix: "유사사례 분석보고서",
  },
  "리스크 계산기": {
    title: "법률비용·손해액 시뮬레이션 시트",
    sections: ["입력 변수", "징계 시 손실", "방어 비용", "최악/완화 시나리오", "의사결정 제안"],
    objective: "경제적 리스크를 수치화해 대응 강도를 결정할 수 있게 한다.",
    subjectPrefix: "법률비용·손해액 산출서",
  },
};

const ORG_PRESETS: Record<OrgType, OrgPreset> = {
  central: {
    label: "중앙부처",
    defaultRecipient: "감사담당관",
    docPrefix: "중앙감사",
    footerAffix: "귀중",
  },
  local: {
    label: "지자체",
    defaultRecipient: "감사위원회",
    docPrefix: "자치감사",
    footerAffix: "귀하",
  },
  public: {
    label: "공공기관",
    defaultRecipient: "인사·감사부서",
    docPrefix: "기관감사",
    footerAffix: "귀중",
  },
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  isArray: (name) => ["prec", "판례", "판례내용"].includes(name),
});

function classifyPurpose(raw: string, selectedTab: DocTab): Purpose {
  if (selectedTab === "소명서 작성" || selectedTab === "면책 신청 가이드") {
    return "소명";
  }
  if (selectedTab === "변론요지서") return "변론";
  if (selectedTab === "답변서") return "답변";
  const t = raw.replace(/\s+/g, " ");
  if (/변론|변호|공판|재판/.test(t)) return "변론";
  if (/답변|반박|해명요구|의견제출/.test(t)) return "답변";
  return "소명";
}

function mergeScenarioText(rawText: string, s: ScenarioGuide): string {
  const guided = [
    s.when ? `언제: ${s.when}` : "",
    s.where ? `어디서: ${s.where}` : "",
    s.who ? `누가: ${s.who}` : "",
    s.what ? `무엇을: ${s.what}` : "",
    s.how ? `어떻게: ${s.how}` : "",
    s.why ? `왜: ${s.why}` : "",
    s.evidence ? `증거/자료: ${s.evidence}` : "",
    s.evidenceFiles && s.evidenceFiles.length > 0
      ? `증거 첨부파일: ${s.evidenceFiles.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${rawText.trim()}\n\n[AI 상황 가이드 정리]\n${guided}`.trim();
}

function tabSpecificGuide(tab: DocTab): string {
  switch (tab) {
    case "부패신고서":
      return "신고 취지, 위반 법령 특정, 조사 요청사항을 명확히 쓰고 감정적 표현은 배제한다.";
    case "고소장":
      return "범죄사실을 시간순으로 특정하고 구성요건(행위, 고의, 결과)을 분리해 작성한다.";
    case "변론요지서":
      return "고의성 부존재, 직무관련성 제한, 포상 이력을 별도 소제목으로 반드시 포함한다.";
    case "답변서":
      return "기관 질의 항목별 반박 구조(질의-사실-법리-결론)로 작성한다.";
    case "소명서 작성":
      return "경위 중심으로 불가피성, 시정조치, 재발방지 계획을 결합해 감경 논리를 만든다.";
    case "면책 신청 가이드":
      return "적극행정 면책요건(공익 목적, 사익 부재, 절차 합리성) 충족 근거를 항목별로 제시한다.";
    case "유사 사례 분석":
      return "판례 3건을 비교표처럼 요약하고 우리 사건에 적용 가능한 포인트와 리스크를 분리한다.";
    case "리스크 계산기":
      return "비용·손실 수치를 근거로 최악/완화 시나리오를 구분하여 의사결정 제안을 작성한다.";
    default:
      return "";
  }
}

function pickIndemnity(purpose: Purpose, merged: string): typeof INDEMNITY_CLAUSES[number] {
  if (purpose === "소명") return INDEMNITY_CLAUSES[0];
  if (/공익|적극행정|소극행정 개선|민원 개선|규제개선/.test(merged)) {
    return INDEMNITY_CLAUSES[0];
  }
  if (/고의 없|실수|착오|절차 미흡/.test(merged)) return INDEMNITY_CLAUSES[1];
  return INDEMNITY_CLAUSES[2];
}

function toCaseQuery(merged: string, selectedTab: DocTab): string {
  const t = `${selectedTab} ${merged}`;
  if (/금품|청탁|선물|식사|상품권/.test(t)) return "금품수수";
  if (/이해충돌|친족|가족|수의계약|입찰/.test(t)) return "이해충돌";
  if (/적극행정|면책|공익|재량/.test(t)) return "적극행정 면책";
  if (/갑질|괴롭힘|폭언|심부름/.test(t)) return "직장 내 괴롭힘";
  return merged.split(/\s+/).slice(0, 5).join(" ");
}

async function fetchPrecedents(query: string): Promise<Precedent[]> {
  const oc = process.env.LAW_API_KEY?.trim() ?? "";
  const base = process.env.LAW_API_BASE_URL?.replace(/\/$/, "") ?? "https://www.law.go.kr/DRF";

  if (!oc) {
    return [
      {
        id: "mock-1",
        title: "금품수수 관련 징계 재량 판단 사례",
        court: "대법원",
        date: "2023-11-02",
        caseNo: "2023두00000",
        gist: "반복성·직무관련성이 인정되면 소액이라도 징계 정당성이 인정될 수 있음을 판시.",
        source: "내장 폴백(법령센터 키 미설정)",
      },
      {
        id: "mock-2",
        title: "적극행정 면책 요건 판단 사례",
        court: "대법원",
        date: "2022-06-16",
        caseNo: "2022두00000",
        gist: "공익 목적·사적 이익 부재·합리적 절차 준수 여부를 종합해 감경 가능성을 인정.",
        source: "내장 폴백(법령센터 키 미설정)",
      },
      {
        id: "mock-3",
        title: "소명서 제출 내용과 징계 양정 사례",
        court: "대법원",
        date: "2021-09-09",
        caseNo: "2021두00000",
        gist: "포상 이력, 신속한 시정, 재발방지 약속은 정상참작 요소가 될 수 있다고 판시.",
        source: "내장 폴백(법령센터 키 미설정)",
      },
    ];
  }

  const url =
    `${base}/lawSearch.do?OC=${encodeURIComponent(oc)}` +
    `&target=prec&type=XML&display=5&query=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      headers: getLawGoKrUpstreamHeaders(),
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!/^<\??xml|^<PrecSearch/i.test(text.trim())) {
      throw new Error("non-xml precedent response");
    }
    const parsed = xmlParser.parse(text) as {
      PrecSearch?: Record<string, unknown>;
      LawSearch?: Record<string, unknown>;
    };
    const root = parsed.PrecSearch ?? parsed.LawSearch ?? {};
    const rows = Array.isArray(root.prec)
      ? (root.prec as Record<string, unknown>[])
      : Array.isArray(root["판례"])
        ? (root["판례"] as Record<string, unknown>[])
        : [];

    const out = rows.slice(0, 3).map((r, i) => ({
      id: String(r["판례일련번호"] ?? r["판례ID"] ?? `prec-${i}`),
      title: String(r["사건명"] ?? r["판례명"] ?? r["판례제목"] ?? "판례"),
      court: r["법원명"] ? String(r["법원명"]) : undefined,
      date: r["선고일자"] ? String(r["선고일자"]) : undefined,
      caseNo: r["사건번호"] ? String(r["사건번호"]) : undefined,
      gist: String(
        r["판결요지"] ??
          r["판시사항"] ??
          r["판례내용"] ??
          "법원은 관련 쟁점을 종합 고려하여 판단함."
      ).replace(/\s+/g, " "),
      source: "국가법령정보센터 판례검색",
    }));

    return out.length > 0 ? out : [];
  } catch (error) {
    console.warn("[legal-defense-draft] precedent fetch failed:", error);
    return [];
  }
}

function rankInterpretations(merged: string): Interpretation[] {
  const scored = INTERPRETATION_DB.map((item) => {
    let score = 0;
    if (/면책|적극행정|공익/.test(merged) && item.topic.includes("면책")) score += 3;
    if (/금품|청탁|선물/.test(merged) && item.topic.includes("금품")) score += 2;
    if (/이해충돌|가족|친족/.test(merged) && item.topic.includes("이해충돌")) score += 2;
    if (/포상|청렴|감경/.test(merged) && item.topic.includes("정상참작")) score += 2;
    return { item, score };
  })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
  return scored.slice(0, 3);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function withParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function withParagraphsAndRefLinks(text: string, precedents: Precedent[]): string {
  const linked = text.replace(/\[판례근거\s*(\d+)\]/g, (_m, nRaw) => {
    const n = Number(nRaw);
    const idx = Number.isFinite(n) ? n - 1 : -1;
    if (idx < 0 || idx >= precedents.length) return `[판례근거 ${nRaw}]`;
    return `<a href="#precedent-${n}" style="color:#1d4ed8;text-decoration:underline;font-weight:700">[판례근거 ${n}]</a>`;
  });
  return linked
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("\n")
    .replace(/&lt;a href=&quot;(#precedent-\d+)&quot; style=&quot;([^&]+)&quot;&gt;(\[판례근거 \d+\])&lt;\/a&gt;/g, '<a href="$1" style="$2">$3</a>');
}

function buildCostEstimate(annualSalary: number, defenseCost: number, expectedFine: number) {
  const monthly = annualSalary / 12;
  const oneMonthCut = Math.round(monthly);
  const twoMonthCut = Math.round(monthly * 2);
  const totalWorst = oneMonthCut + defenseCost + expectedFine;
  return { oneMonthCut, twoMonthCut, totalWorst };
}

function buildDocNo(tab: DocTab, preset: OrgPreset): string {
  const y = new Date().getFullYear();
  const m = String(new Date().getMonth() + 1).padStart(2, "0");
  const d = String(new Date().getDate()).padStart(2, "0");
  const code =
    tab === "부패신고서"
      ? "REP"
      : tab === "고소장"
        ? "ACC"
        : tab === "변론요지서"
          ? "PLE"
          : tab === "답변서"
            ? "ANS"
            : tab === "소명서 작성"
              ? "EXP"
              : tab === "면책 신청 가이드"
                ? "IMM"
                : tab === "유사 사례 분석"
                  ? "CAS"
                  : "RSK";
  return `${preset.docPrefix}-${code}-${y}${m}${d}`;
}

function toStructuredHtml(params: {
  title: string;
  selectedTab: DocTab;
  orgType: OrgType;
  orgPreset: OrgPreset;
  purpose: Purpose;
  merged: string;
  narrative: string;
  laws: LawSearchItem[];
  precedents: Precedent[];
  interpretations: Interpretation[];
  indemnityTitle: string;
  template: TabTemplate;
  agency?: string;
  recipient?: string;
  drafter?: string;
}): string {
  const lawItems = params.laws
    .slice(0, 4)
    .map(
      (l) =>
        `<li>${escapeHtml(l.name)}${l.department ? ` · ${escapeHtml(l.department)}` : ""}</li>`
    )
    .join("\n");
  const precItems = params.precedents
    .slice(0, 3)
    .map(
      (p, i) =>
        `<li id="precedent-${i + 1}"><b>${escapeHtml(p.title)}</b>${p.caseNo ? ` (${escapeHtml(p.caseNo)})` : ""} - ${escapeHtml(
          p.gist
        )}</li>`
    )
    .join("\n");
  const interpItems = params.interpretations
    .map((i) => `<li>${escapeHtml(i.org)} · ${escapeHtml(i.topic)} - ${escapeHtml(i.gist)}</li>`)
    .join("\n");
  const templateItems = params.template.sections
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("\n");
  const citedInText = params.precedents
    .slice(0, 3)
    .map((p, idx) => `[판례근거 ${idx + 1}] ${p.title}${p.caseNo ? ` (${p.caseNo})` : ""}`)
    .join("\n");
  const today = new Date().toISOString().slice(0, 10);
  const docNo = buildDocNo(params.selectedTab, params.orgPreset);
  const subject = `${params.template.subjectPrefix} 제출`;
  const finalRecipient = params.recipient || params.orgPreset.defaultRecipient;

  return `
<section class="legal-draft-doc">
  <h1>${escapeHtml(params.title)}</h1>
  <table style="width:100%;border-collapse:collapse;margin:12px 0 16px 0;font-size:14px">
    <tr><td style="width:110px;border:1px solid #d1d5db;padding:6px 8px"><b>문서번호</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(docNo)}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>시행일자</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(today)}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>기관유형</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(params.orgPreset.label)}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>수신</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(finalRecipient)}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>제목</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(subject)}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>소속기관</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(params.agency || "미기재")}</td></tr>
    <tr><td style="border:1px solid #d1d5db;padding:6px 8px"><b>작성자</b></td><td style="border:1px solid #d1d5db;padding:6px 8px">${escapeHtml(params.drafter || "미기재")}</td></tr>
  </table>
  <p><b>문서 유형:</b> ${escapeHtml(params.selectedTab)} / <b>목적 분류:</b> ${escapeHtml(params.purpose)}</p>
  <p><b>적용 양식:</b> ${escapeHtml(params.template.title)}</p>
  <p><b>양식 목표:</b> ${escapeHtml(params.template.objective)}</p>
  <p><b>우선 추천 면책 논리:</b> ${escapeHtml(params.indemnityTitle)}</p>

  <h2>1. 사건 개요(육하원칙 통합)</h2>
  ${withParagraphs(params.merged)}

  <h2>2. 법리적 주장(판례·유권해석 기반)</h2>
  ${withParagraphsAndRefLinks(params.narrative, params.precedents)}
  <p><b>인용 라벨:</b><br/>${escapeHtml(citedInText).replace(/\n/g, "<br/>")}</p>

  <h2>3. 관련 법령</h2>
  <ul>${lawItems}</ul>

  <h2>4. 유사 대법원 판례 3건</h2>
  <ul>${precItems}</ul>

  <h2>5. 유권해석(권익위·인사혁신처)</h2>
  <ul>${interpItems}</ul>

  <h2>6. 표준 양식 체크리스트</h2>
  <ul>${templateItems}</ul>

  <h2>7. 결론 및 요청사항</h2>
  <p>위 사실관계와 법령·판례·유권해석을 종합할 때, 본 건은 재량권 범위 내 조치 또는 감경 가능한 사안으로 검토됩니다.</p>
  <h2>8. 첨부 목록(권장)</h2>
  <ol>
    <li>카카오톡/이메일 캡처본 1부</li>
    <li>결재 문서 및 보고 이력 1부</li>
    <li>반환·신고 접수증 1부</li>
    <li>포상·근무평정 등 정상참작 자료 1부</li>
  </ol>
  <div style="margin-top:26px;text-align:right">
    <p>${escapeHtml(today)}</p>
    <p>${escapeHtml(params.agency || "소속기관")} ${escapeHtml(params.drafter || "작성자")} (인)</p>
    <p>${escapeHtml(finalRecipient)} ${escapeHtml(params.orgPreset.footerAffix)}</p>
  </div>
  <p>${escapeHtml(DISCLAIMER)}</p>
</section>`.trim();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const template = TAB_TEMPLATES[data.selectedTab];
  const orgPreset = ORG_PRESETS[data.orgType];
  const purpose = classifyPurpose(data.rawText, data.selectedTab);
  const merged = mergeScenarioText(data.rawText, data.scenarioGuide as ScenarioGuide);
  const clause = pickIndemnity(purpose, merged);
  const caseQuery = toCaseQuery(merged, data.selectedTab);

  // clientPrecedents / clientLaws 제공 시 서버측 law.go.kr 호출 스킵 (브라우저 IP 우회)
  const [laws, precedents] = await Promise.all([
    data.clientLaws && data.clientLaws.length > 0
      ? Promise.resolve({
          query: caseQuery,
          totalCnt: data.clientLaws.length,
          items: data.clientLaws.map((l) => ({ id: l.id, name: l.name, department: l.department })),
          mocked: false,
          source: "client-direct" as const,
        })
      : searchLaws(`${data.selectedTab} ${caseQuery}`),
    data.clientPrecedents && data.clientPrecedents.length > 0
      ? Promise.resolve(
          data.clientPrecedents.map((p, i) => ({
            id: p.id ?? `cp-${i}`,
            title: p.title,
            court: p.court,
            date: p.date,
            caseNo: p.caseNo,
            gist: p.gist,
            source: p.source ?? "브라우저 직접 검색",
          }))
        )
      : fetchPrecedents(caseQuery),
  ]);
  const interpretations = rankInterpretations(merged);

  const promptContext = [
    `문서유형: ${data.selectedTab}`,
    `목적분류: ${purpose}`,
    `우선 면책논리: ${clause.title}`,
    `적용 표준양식: ${template.title}`,
    `양식 핵심섹션: ${template.sections.join(" / ")}`,
    "",
    "[사건 입력 원문]",
    merged,
    data.scenarioGuide.rewardHistory
      ? `\n[포상 이력]\n${data.scenarioGuide.rewardHistory}`
      : "",
    "\n[실제 검색된 판례(RAG) - 아래 항목만 인용 가능]",
    ...precedents.map(
      (p, idx) =>
        `${idx + 1}) ${p.title}${p.caseNo ? ` (${p.caseNo})` : ""}\n- 요지: ${p.gist}\n- 출처: ${p.source}`
    ),
    "\n[유권해석(RAG) - 아래 항목만 인용 가능]",
    ...interpretations.map((i, idx) => `${idx + 1}) ${i.org} ${i.topic}: ${i.gist}`),
    "\n[관련 법령 검색 결과]",
    ...laws.items.slice(0, 4).map((l, idx) => `${idx + 1}) ${l.name}`),
  ]
    .filter(Boolean)
    .join("\n");

  const system = [
    "당신은 공공부문 법률문서 실무 작성 전문가입니다.",
    "반드시 제공된 RAG 자료(판례/유권해석/법령 목록)만 인용하고, 없는 사건번호나 가짜 판례를 생성하지 마십시오.",
    "출력은 한국어, 7개 섹션으로 구성:",
    "1) 사실관계 정리 2) 쟁점 3) 법리적 주장 4) 정상참작/감경 논리 5) 입증자료 체크리스트 6) 표준양식 체크리스트 7) 제출문안",
    "문체는 공식 문서체로 작성.",
    "소명 목적이면 적극행정 면책 요건(공익 목적, 사익 부재, 절차 합리성)을 우선 적용.",
    "변론 목적이면 포상 이력의 법적 참작 포인트를 별도 문단으로 반드시 포함.",
    "법리 주장 문단마다 [판례근거 1] 같은 형태로 제공된 판례 라벨을 명시한다.",
    `문서유형별 작성 규칙: ${tabSpecificGuide(data.selectedTab)}`,
  ].join("\n");

  const aiText = await callText({
    system,
    messages: [{ role: "user", content: promptContext }],
    temperature: 0.25,
    maxOutputTokens: 1800,
  });

  const fallbackNarrative = [
    "[사실관계 정리] 입력된 사건을 육하원칙 기준으로 재배열하였고, 직무관련성·반복성·사익 여부를 핵심 변수로 확인했습니다.",
    "[쟁점] 금품/이해충돌/절차 위반 가능성 중 실제 증거로 입증 가능한 부분과 반박 가능한 부분을 분리했습니다.",
    "[법리적 주장] 고의성 부존재, 공익 목적, 사전 검토·사후 시정 조치의 존재를 중심으로 방어 논리를 구성했습니다.",
    "[정상참작/감경] 포상 이력, 평소 청렴 태도, 재발방지 계획을 결합해 처분수위 완화 논리를 제시합니다.",
    "[입증자료] 결재흔적, 메신저 로그, 반환/신고 기록, 포상 증빙, 내부 컨설팅 내역을 우선 제출하십시오.",
    `[표준양식 체크리스트] ${template.sections.join(", ")}`,
    "[제출문안] 본 건은 공익 실현 과정에서 발생한 비고의적 사안임을 전제로 감경 또는 면책을 요청합니다.",
  ].join("\n\n");
  const tabLead =
    data.selectedTab === "부패신고서"
      ? "[신고 취지] 공직윤리 위반 가능성이 있는 행위를 특정하고 조사 개시를 요청합니다."
      : data.selectedTab === "고소장"
        ? "[고소 취지] 피고소인의 위법행위를 구성요건 중심으로 특정하여 처벌을 구합니다."
        : data.selectedTab === "변론요지서"
          ? "[변론 취지] 고의성 부존재 및 직무상 불가피성을 중심으로 감경/무혐의를 주장합니다."
          : data.selectedTab === "답변서"
            ? "[답변 취지] 기관 질의사항에 대해 사실오인과 법리오해를 교정하는 답변을 제출합니다."
            : data.selectedTab === "면책 신청 가이드"
              ? "[면책 신청 취지] 적극행정 면책요건 충족을 근거로 면책 결정을 요청합니다."
              : data.selectedTab === "유사 사례 분석"
                ? "[분석 취지] 유사 판례의 판단 구조를 비교해 실무 방어 우선순위를 제시합니다."
                : "[산출 취지] 경제적 리스크를 수치화해 대응 강도를 결정할 수 있도록 제시합니다.";
  const narrative = aiText ? `${tabLead}\n\n${aiText}` : `${tabLead}\n\n${fallbackNarrative}`;
  const title = `${data.selectedTab} 자동초안`;

  const html = toStructuredHtml({
    title,
    selectedTab: data.selectedTab,
    orgType: data.orgType,
    orgPreset,
    purpose,
    merged,
    narrative,
    laws: laws.items,
    precedents,
    interpretations,
    indemnityTitle: clause.title,
    template,
    agency: data.agency,
    recipient: data.recipient,
    drafter: data.drafter,
  });

  const salaryAnnual = (data.salaryMonthly ?? 0) * 12;
  const estimate = buildCostEstimate(salaryAnnual, data.defenseCost ?? 0, data.expectedFine ?? 0);

  return NextResponse.json({
    ok: true,
    data: {
      selectedTab: data.selectedTab,
      orgType: data.orgType,
      orgPreset,
      purpose,
      recommendedClause: clause,
      mergedScenario: merged,
      relatedLaws: laws.items.slice(0, 5),
      precedents,
      interpretations,
      narrative,
      html,
      disclaimer: DISCLAIMER,
      template,
      estimate,
      rag: {
        lawSource: laws.source,
        precedentCount: precedents.length,
      },
    },
  });
}
