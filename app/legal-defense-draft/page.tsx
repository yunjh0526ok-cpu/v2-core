"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Breadcrumbs from "@/components/nav/Breadcrumbs";
import { searchPrecedentsClient, searchLawsClient } from "@/lib/law-api-client";
import LegalDefenseChat from "@/components/legal/LegalDefenseChat";
import {
  BadgeAlert,
  Calculator,
  FileCheck2,
  FilePenLine,
  FileSearch,
  Gavel,
  Lightbulb,
  Scale,
  Send,
  Sparkles,
} from "lucide-react";

type PrecedentItem = {
  caseNo: string; court: string; date: string; gist: string;
  outcome: string; similarity: "높음" | "중간" | "낮음"; relevantPoint: string;
};
type PrecedentResponse = { items: PrecedentItem[]; advice: string; totalFound: number; noResults?: boolean };

type DocTab =
  | "부패신고서"
  | "고소장"
  | "변론요지서"
  | "답변서"
  | "소명서 작성"
  | "면책 신청 가이드"
  | "유사 사례 분석"
  | "리스크 계산기";

type Purpose = "소명" | "답변" | "변론";

type ApiData = {
  selectedTab: DocTab;
  orgType: "central" | "local" | "public";
  orgPreset: { label: string; defaultRecipient: string; docPrefix: string; footerAffix: string };
  purpose: Purpose;
  recommendedClause: { id: string; title: string; rationale: string };
  mergedScenario: string;
  relatedLaws: Array<{ id: string; name: string; department?: string }>;
  precedents: Array<{
    id: string;
    title: string;
    caseNo?: string;
    court?: string;
    date?: string;
    gist: string;
    source: string;
  }>;
  interpretations: Array<{ org: string; topic: string; gist: string; source: string }>;
  narrative: string;
  html: string;
  disclaimer: string;
  template: { title: string; sections: string[]; objective: string };
  estimate: { oneMonthCut: number; twoMonthCut: number; totalWorst: number };
  rag: { lawSource: string; precedentCount: number };
};

const TAB_CONFIG: Record<
  DocTab,
  {
    headline: string;
    placeholder: string;
    required: string[];
  }
> = {
  부패신고서: {
    headline: "위반행위 + 위반법령 + 조사요청을 분리해서 입력",
    placeholder:
      "예: 계약 담당자가 직무관련 업체로부터 명절 선물을 수수했고, 내부 반환 조치 없이 보관했습니다. 청탁금지법 위반 소지가 있어 조사 개시를 요청합니다.",
    required: ["행위자/직책", "위반행위", "증거자료", "조사 요청사항"],
  },
  고소장: {
    headline: "시간순 범죄사실 + 구성요건 충족 근거를 중심 입력",
    placeholder:
      "예: 2026.04.12 피고소인이 허위자료를 제출해 공문서 작성 절차를 왜곡했고, 그 결과 계약심사 결과가 변경되었습니다.",
    required: ["피고소인 특정", "범죄사실", "피해/결과", "입증자료"],
  },
  변론요지서: {
    headline: "고의 부존재 + 직무상 필요성 + 포상 이력을 함께 입력",
    placeholder:
      "예: 민원 신속처리를 위해 재량 범위 내 판단을 했고 사익 목적은 전혀 없었습니다. 유사 사안에서 공익성을 인정받은 판례 논리를 적용하고 싶습니다.",
    required: ["쟁점", "방어논리", "포상/공적", "재발방지 계획"],
  },
  답변서: {
    headline: "기관 질의 항목별로 사실-법리-결론 순서 입력",
    placeholder:
      "예: 감사 질의 1번(수의계약 절차 위반)에 대해 사실관계와 내부 승인 근거를 제출하며, 고의성 없음과 시정조치 완료를 답변합니다.",
    required: ["질의항목", "사실정정", "법리반박", "결론요청"],
  },
  "소명서 작성": {
    headline: "경위·불가피성·시정조치·정상참작을 분리 입력",
    placeholder:
      "예: 당시 긴급 민원 대응 과정에서 절차 누락이 있었으나 즉시 자진보고 및 시정조치를 완료했습니다. 향후 재발방지 계획을 포함해 소명합니다.",
    required: ["경위", "불가피성", "시정조치", "정상참작 사유"],
  },
  "면책 신청 가이드": {
    headline: "공익 목적·사익 부재·절차 합리성 중심 입력",
    placeholder:
      "예: 주민 안전 확보를 위한 적극행정 과정에서 재량 판단을 했고 사적 이익은 없었습니다. 사전 검토 문서와 보고 체계도 갖췄습니다.",
    required: ["공익성", "사익 부재", "절차 준수", "면책 요청사항"],
  },
  "유사 사례 분석": {
    headline: "우리 사건 요약 + 비교하고 싶은 쟁점 입력",
    placeholder:
      "예: 금품수수 의심 사안이지만 반환 조치와 즉시 신고가 있었습니다. 유사 판례에서 처분수위가 어떻게 달라지는지 비교 분석이 필요합니다.",
    required: ["사건요약", "핵심쟁점", "비교 포인트", "원하는 결론"],
  },
  "리스크 계산기": {
    headline: "사건 개요 + 비용/손실 판단에 필요한 변수 입력",
    placeholder:
      "예: 징계 가능성에 대비해 방어비용, 벌금, 보수감액을 포함한 총손실을 계산하고, 대응 강도별 의사결정안을 받고 싶습니다.",
    required: ["사건개요", "비용 변수", "최악 시나리오", "완화 시나리오"],
  },
};

const TAB_META: Array<{ tab: DocTab; icon: ReactNode; desc: string }> = [
  { tab: "부패신고서", icon: <BadgeAlert className="h-4 w-4" />, desc: "위반 법령 특정 + 신고 취지 정리" },
  { tab: "고소장", icon: <Scale className="h-4 w-4" />, desc: "범죄사실을 법적 구성요건에 맞춰 재구성" },
  { tab: "변론요지서", icon: <Gavel className="h-4 w-4" />, desc: "고의성 부존재 + 직무관련성 방어 논리" },
  { tab: "답변서", icon: <FileCheck2 className="h-4 w-4" />, desc: "감사·징계 질의에 대한 공식 의견서" },
  { tab: "소명서 작성", icon: <FilePenLine className="h-4 w-4" />, desc: "정상참작 중심 초기 대응 문건" },
  { tab: "면책 신청 가이드", icon: <Lightbulb className="h-4 w-4" />, desc: "적극행정 면책요건 중심 공세적 방어" },
  { tab: "유사 사례 분석", icon: <FileSearch className="h-4 w-4" />, desc: "대법원 판례 3건 + 유권해석 매칭" },
  { tab: "리스크 계산기", icon: <Calculator className="h-4 w-4" />, desc: "변호사비·감봉·예상 벌금 손실 추산" },
];

const GUIDE_QUESTIONS = [
  "언제(발생 시점/기간)",
  "어디서(부서/현장)",
  "누가(관련자/직책)",
  "무엇을(행위/금품/지시)",
  "어떻게(진행 과정)",
  "왜(배경/동기)",
  "증거(문서/메신저/결재흔적)",
] as const;

function money(n: number) {
  return `${Math.max(0, Math.round(n)).toLocaleString()}원`;
}

export default function LegalDefenseDraftPage() {
  const [composeMode, setComposeMode] = useState<"ai" | "manual">("ai");
  const [selectedTab, setSelectedTab] = useState<DocTab>("소명서 작성");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "precedent") {
      setComposeMode("manual");
      setSelectedTab("유사 사례 분석");
    }
  }, []);
  const [orgType, setOrgType] = useState<"central" | "local" | "public">("public");
  const [rawText, setRawText] = useState("");
  const [agency, setAgency] = useState("");
  const [recipient, setRecipient] = useState("감사부서");
  const [drafter, setDrafter] = useState("");
  const [whenText, setWhenText] = useState("");
  const [whereText, setWhereText] = useState("");
  const [whoText, setWhoText] = useState("");
  const [whatText, setWhatText] = useState("");
  const [howText, setHowText] = useState("");
  const [whyText, setWhyText] = useState("");
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [rewardHistory, setRewardHistory] = useState("");
  const [salaryMonthly, setSalaryMonthly] = useState("4500000");
  const [defenseCost, setDefenseCost] = useState("3000000");
  const [expectedFine, setExpectedFine] = useState("1000000");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiData | null>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  // 유사 사례 분석 전용 상태
  const [precedentQuery, setPrecedentQuery] = useState("");
  const [precedentLoading, setPrecedentLoading] = useState(false);
  const [precedentError, setPrecedentError] = useState<string | null>(null);
  const [precedentResult, setPrecedentResult] = useState<PrecedentResponse | null>(null);

  const mergedPreview = useMemo(() => {
    const parts = [
      rawText,
      [
        whenText ? `언제: ${whenText}` : "",
        whereText ? `어디서: ${whereText}` : "",
        whoText ? `누가: ${whoText}` : "",
        whatText ? `무엇을: ${whatText}` : "",
        howText ? `어떻게: ${howText}` : "",
        whyText ? `왜: ${whyText}` : "",
        evidenceText ? `증거: ${evidenceText}` : "",
        evidenceFiles.length > 0
          ? `첨부파일: ${evidenceFiles.map((f) => f.name).join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" / "),
    ]
      .filter(Boolean)
      .join("\n");
    return parts || "아직 입력 전";
  }, [rawText, whenText, whereText, whoText, whatText, howText, whyText, evidenceText, evidenceFiles]);

  const submit = async () => {
    if (rawText.trim().length < 5) {
      setError("사건 개요를 5자 이상 입력해 주세요.");
      return;
    }
    setLoading(true);
    setPhase("running");
    setError(null);
    setResult(null);
    try {
      // 브라우저에서 직접 law.go.kr 검색 → Vercel 서버 IP 우회
      const [clientPrecedents, clientLaws] = await Promise.allSettled([
        searchPrecedentsClient(rawText, 5),
        searchLawsClient(rawText, 5),
      ]).then(([p, l]) => [
        p.status === "fulfilled" ? p.value : [],
        l.status === "fulfilled" ? l.value : [],
      ]);

      const res = await fetch("/api/legal-defense-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedTab,
          orgType,
          rawText,
          agency,
          recipient,
          drafter,
          scenarioGuide: {
            when: whenText,
            where: whereText,
            who: whoText,
            what: whatText,
            how: howText,
            why: whyText,
            evidence: evidenceText,
            evidenceFiles: evidenceFiles.map((f) => f.name),
            rewardHistory,
          },
          salaryMonthly: Number(salaryMonthly || 0),
          defenseCost: Number(defenseCost || 0),
          expectedFine: Number(expectedFine || 0),
          clientPrecedents: (clientPrecedents as Awaited<ReturnType<typeof searchPrecedentsClient>>).map((p) => ({
            title: p.gist,
            caseNo: p.caseNo,
            court: p.court,
            date: p.date,
            gist: p.gist,
            source: "브라우저 직접 검색",
          })),
          clientLaws: (clientLaws as Awaited<ReturnType<typeof searchLawsClient>>).map((l) => ({
            id: l.id,
            name: l.name,
            department: l.department,
          })),
        }),
      });
      const text = await res.text();
      const json = JSON.parse(text) as { ok: boolean; error?: string; data?: ApiData };
      if (!json.ok || !json.data) {
        setError(json.error ?? "문서 생성에 실패했습니다.");
        return;
      }
      setResult(json.data);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  };

  const printHtml = () => {
    if (!result?.html) return;
    const w = window.open("", "_blank", "width=1000,height=900");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Legal Defense Draft</title>
      <style>body{font-family:Arial,sans-serif;line-height:1.6;padding:24px}h1{font-size:26px}h2{font-size:18px;margin-top:20px}li{margin-bottom:6px}</style>
      </head><body>${result.html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const downloadHtml = () => {
    if (!result?.html) return;
    const doc = `<!doctype html><html><head><meta charset="utf-8"/><title>${result.selectedTab} 자동초안</title></head><body>${result.html}</body></html>`;
    const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.selectedTab.replace(/\s+/g, "_")}_자동초안.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitPrecedent = async () => {
    if (precedentQuery.trim().length < 5) {
      setPrecedentError("상황을 5자 이상 입력해 주세요.");
      return;
    }
    setPrecedentLoading(true);
    setPrecedentError(null);
    setPrecedentResult(null);
    try {
      const res = await fetch("/api/legal-defense/precedent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situation: precedentQuery }),
      });
      const json = await res.json();
      if (!json.ok || !json.data) {
        setPrecedentError(json.error ?? "판례 검색에 실패했습니다.");
        return;
      }
      setPrecedentResult(json.data as PrecedentResponse);
    } catch (e) {
      setPrecedentError(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setPrecedentLoading(false);
    }
  };

  /** 예전 이름 유지 — 브라우저 직접 law.go.kr 호출 제거 후 서버 API와 동일 */
  const submitPrecedentClient = submitPrecedent;

  const tabUi = TAB_CONFIG[selectedTab];

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="rounded-2xl border border-white/10 bg-navy-900/55 p-3">
        <div className="grid gap-2 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setComposeMode("ai")}
            className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
              composeMode === "ai"
                ? "border-sky-400/45 bg-sky-500/15 text-white"
                : "border-white/10 bg-white/[0.02] text-steel-200 hover:border-sky-300/35"
            }`}
          >
            AI 대화로 작성
          </button>
          <button
            type="button"
            onClick={() => setComposeMode("manual")}
            className={`rounded-xl border px-3 py-3 text-sm font-black transition ${
              composeMode === "manual"
                ? "border-sky-400/45 bg-sky-500/15 text-white"
                : "border-white/10 bg-white/[0.02] text-steel-200 hover:border-sky-300/35"
            }`}
          >
            직접 입력
          </button>
        </div>
      </section>

      {composeMode === "ai" ? (
        <LegalDefenseChat />
      ) : (
        <>
      <Breadcrumbs items={[{ label: "Legal-Defense-Draft" }]} />

      <section className="gradient-border glass-strong relative overflow-hidden rounded-3xl p-5 md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-48 w-48 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-[11px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">Legal-Defense-Draft · 공직자 실전 방어 문서 스튜디오</span>
          </p>
          <h1 className="mt-2 text-2xl font-black text-white md:text-4xl">
            사건 개요만 넣으면
            <br />
            <span className="gradient-text">소명/답변/변론</span> 목적을 먼저 분류하고,
            표준 서식 문서를 자동 생성합니다.
          </h1>
          <p className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-white/85 md:text-[15px]">
            RAG 방식으로 국가법령정보센터 판례 검색 결과 + 권익위/인사혁신처 유권해석 요지만 근거로 사용합니다.
            적극행정 면책 가이드는 소명 목적일 때 우선 매칭됩니다.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-300/35 bg-amber-500/10 p-4">
        <p className="text-xs font-black text-amber-200">중요 고지</p>
        <p className="mt-1 text-xs leading-relaxed text-amber-100/90 md:text-sm">
          본 서비스 출력물은 법적 효력이 없는 참고용 초안입니다. 허위/부정확 입력, 증거 미검증, 제3자 권리침해가 있는 경우 법적 문제가 발생할 수 있으며
          최종 제출 전 반드시 전문가 검토를 거치세요.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-navy-900/55 p-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {TAB_META.map((t) => {
            const active = selectedTab === t.tab;
            return (
              <button
                key={t.tab}
                type="button"
                onClick={() => setSelectedTab(t.tab)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  active
                    ? "border-sky-400/45 bg-sky-500/15 text-white"
                    : "border-white/10 bg-white/[0.02] text-steel-200 hover:border-sky-300/35"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-black">{t.icon}{t.tab}</div>
                <p className="mt-1 text-xs text-steel-300">{t.desc}</p>
              </button>
            );
          })}
        </div>
      </section>

      {selectedTab === "유사 사례 분석" ? (
        <section className="rounded-2xl border border-white/10 bg-navy-900/55 p-4 space-y-4">
          <div>
            <h2 className="text-lg font-black text-white">유사 사례 분석</h2>
            <p className="mt-1 text-xs text-steel-300">
              상황을 한 번 입력하면 관련 판례 3건을 즉시 분석합니다. AI가 질문하지 않고 바로 결과를 보여줍니다.
            </p>
          </div>
          <textarea
            value={precedentQuery}
            onChange={(e) => setPrecedentQuery(e.target.value)}
            className="h-36 w-full rounded-xl border border-white/10 bg-navy-950/70 p-3 text-sm text-white outline-none focus:border-sky-300/50"
            placeholder={TAB_CONFIG["유사 사례 분석"].placeholder}
          />
          <button
            type="button"
            onClick={submitPrecedent}
            disabled={precedentLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <FileSearch className="h-4 w-4" />
            {precedentLoading ? "판례 분석 중..." : "판례 즉시 검색"}
          </button>
          {precedentError && (
            <p className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">
              {precedentError}
            </p>
          )}
          {precedentResult && precedentResult.noResults && (
            <div className="rounded-xl border border-amber-300/35 bg-amber-500/10 p-4 space-y-2">
              <p className="text-sm font-black text-amber-200">관련 판례를 찾지 못했습니다.</p>
              <p className="text-xs text-amber-100/80">
                국가법령정보 API에서 검색 결과가 없습니다.{" "}
                <a
                  href="https://glaw.scourt.go.kr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-sky-300 hover:text-sky-200"
                >
                  glaw.scourt.go.kr
                </a>
                {" "}에서 직접 검색하세요.
              </p>
            </div>
          )}
          {precedentResult && !precedentResult.noResults && (
            <div className="space-y-3">
              {precedentResult.items.map((item, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-navy-950/60 p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black border ${item.outcome === "승소" ? "bg-emerald-500/20 text-emerald-200 border-emerald-300/40" : item.outcome === "패소" ? "bg-rose-500/20 text-rose-200 border-rose-300/40" : "bg-white/10 text-steel-200 border-white/10"}`}>
                      {item.outcome}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-black border ${item.similarity === "높음" ? "bg-sky-500/20 text-sky-200 border-sky-300/40" : item.similarity === "중간" ? "bg-violet-500/20 text-violet-200 border-violet-300/40" : "bg-white/10 text-steel-300 border-white/10"}`}>
                      유사도 {item.similarity}
                    </span>
                    <span className="text-xs text-steel-400">
                      {item.caseNo} | {item.court}{item.date ? ` | ${item.date}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-steel-100">{item.gist}</p>
                  <p className="text-xs text-sky-300">연결 포인트: {item.relevantPoint}</p>
                </div>
              ))}
              {precedentResult.advice && (
                <div className="rounded-xl border border-violet-300/30 bg-violet-500/10 p-4">
                  <p className="text-xs font-black text-violet-200">종합 조언</p>
                  <p className="mt-1 text-sm text-steel-100">{precedentResult.advice}</p>
                </div>
              )}
              <p className="text-xs text-steel-500">
                검색된 판례 {precedentResult.totalFound}건 중 상위 3건 표시
              </p>
            </div>
          )}
        </section>
      ) : (
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
          <h2 className="text-lg font-black text-white">사건 입력</h2>
          <p className="mt-1 text-xs text-steel-300">
            탭마다 문서 구조가 다르게 생성됩니다. 오른쪽 AI 상황 가이드 답변을 자동으로 합쳐 전문 문서형 입력으로 변환합니다.
          </p>
          <div className="mt-3 rounded-xl border border-sky-300/25 bg-sky-500/10 p-3">
            <p className="text-xs font-black text-sky-100">유형별 입력 가이드</p>
            <p className="mt-1 text-sm font-bold text-white">{tabUi.headline}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tabUi.required.map((it) => (
                <span key={it} className="rounded-full border border-sky-300/30 bg-navy-950/50 px-2 py-0.5 text-[11px] font-bold text-sky-200">
                  {it}
                </span>
              ))}
            </div>
          </div>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            className="mt-3 h-36 w-full rounded-xl border border-white/10 bg-navy-950/70 p-3 text-sm text-white outline-none focus:border-sky-300/50"
            placeholder={tabUi.placeholder}
          />

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <button
              type="button"
              onClick={() => {
                setOrgType("central");
                if (!recipient || recipient === "감사부서") setRecipient("감사담당관");
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${orgType === "central" ? "border-sky-300/60 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.02] text-steel-200"}`}
            >
              중앙부처 프리셋
            </button>
            <button
              type="button"
              onClick={() => {
                setOrgType("local");
                if (!recipient || recipient === "감사부서") setRecipient("감사위원회");
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${orgType === "local" ? "border-sky-300/60 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.02] text-steel-200"}`}
            >
              지자체 프리셋
            </button>
            <button
              type="button"
              onClick={() => {
                setOrgType("public");
                if (!recipient || recipient === "감사부서") setRecipient("인사·감사부서");
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-bold ${orgType === "public" ? "border-sky-300/60 bg-sky-500/15 text-sky-100" : "border-white/10 bg-white/[0.02] text-steel-200"}`}
            >
              공공기관 프리셋
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <input
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm"
              placeholder="소속기관 (예: ○○시청)"
            />
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm"
              placeholder="수신처 (예: 징계위원회)"
            />
            <input
              value={drafter}
              onChange={(e) => setDrafter(e.target.value)}
              className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm"
              placeholder="작성자/직급"
            />
          </div>

          {selectedTab === "변론요지서" && (
            <div className="mt-3">
              <label className="text-xs font-bold text-sky-200">공직 포상 이력(변론요지서 전용)</label>
              <textarea
                value={rewardHistory}
                onChange={(e) => setRewardHistory(e.target.value)}
                className="mt-1 h-24 w-full rounded-xl border border-sky-300/25 bg-navy-950/70 p-3 text-sm text-white outline-none"
                placeholder="예: 국무총리 표창(2023), 기관장 표창 2회, 청렴 우수사례 선정..."
              />
            </div>
          )}

          <div className="mt-4 rounded-xl border border-white/10 bg-navy-950/60 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-black text-white">
              <Calculator className="h-4 w-4 text-violet-300" /> 법률 비용·손해액 시뮬레이터
            </div>
            <div className="grid gap-2 md:grid-cols-3">
              <input value={salaryMonthly} onChange={(e) => setSalaryMonthly(e.target.value)} className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm" placeholder="월 보수" />
              <input value={defenseCost} onChange={(e) => setDefenseCost(e.target.value)} className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm" placeholder="변호사 비용" />
              <input value={expectedFine} onChange={(e) => setExpectedFine(e.target.value)} className="rounded-lg border border-white/10 bg-navy-900/70 px-3 py-2 text-sm" placeholder="예상 벌금" />
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-sky-300/20 bg-sky-500/5 p-3">
            <p className="text-xs font-black text-sky-200">증거 첨부(파일명 반영)</p>
            <p className="mt-1 text-[11px] text-steel-300">
              실제 제출용 원본은 기관 결재 시스템에 별도 첨부하세요. 여기서는 파일명만 문서 본문에 반영됩니다.
            </p>
            <input
              type="file"
              multiple
              onChange={(e) => setEvidenceFiles(Array.from(e.target.files ?? []))}
              className="mt-2 block w-full text-xs text-steel-200 file:mr-2 file:rounded-lg file:border-0 file:bg-sky-500/20 file:px-2 file:py-1 file:font-bold file:text-sky-100"
            />
            {evidenceFiles.length > 0 && (
              <ul className="mt-2 space-y-1 text-[11px] text-steel-300">
                {evidenceFiles.map((f) => (
                  <li key={f.name}>- {f.name}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {loading ? "사건 분석 + 문서 작성 중..." : "사건 분석 시작"}
          </button>
          {phase === "running" && (
            <div className="mt-3 rounded-xl border border-violet-300/30 bg-violet-500/10 p-3 text-xs text-violet-100">
              <p>1) 사건 맥락 분석 중...</p>
              <p className="mt-1">2) 법령/판례/유권해석 매칭 중...</p>
              <p className="mt-1">3) 탭별 서식 문서 작성 중...</p>
            </div>
          )}

          {error && <p className="mt-2 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200">{error}</p>}
        </div>

        <div className="rounded-2xl border border-sky-300/25 bg-sky-950/15 p-4">
          <div className="flex items-center gap-2 text-sm font-black text-sky-200">
            <Sparkles className="h-4 w-4" /> AI 상황 가이드
          </div>
          <p className="mt-1 text-xs text-steel-300">질문에 짧게 답하면 자동으로 사건 문장으로 합쳐집니다.</p>
          <div className="mt-3 space-y-2">
            <GuideInput q={GUIDE_QUESTIONS[0]} value={whenText} onChange={setWhenText} placeholder="예: 2026년 4월 초" />
            <GuideInput q={GUIDE_QUESTIONS[1]} value={whereText} onChange={setWhereText} placeholder="예: 인허가팀 민원창구" />
            <GuideInput q={GUIDE_QUESTIONS[2]} value={whoText} onChange={setWhoText} placeholder="예: 민원업체 담당자, 팀장" />
            <GuideInput q={GUIDE_QUESTIONS[3]} value={whatText} onChange={setWhatText} placeholder="예: 한우세트 전달, 반려 지시" />
            <GuideInput q={GUIDE_QUESTIONS[4]} value={howText} onChange={setHowText} placeholder="예: 메신저로 전달 후 수령" />
            <GuideInput q={GUIDE_QUESTIONS[5]} value={whyText} onChange={setWhyText} placeholder="예: 관계 유지 명목" />
            <GuideInput q={GUIDE_QUESTIONS[6]} value={evidenceText} onChange={setEvidenceText} placeholder="예: 카톡, CCTV, 결재 로그" />
          </div>
          <div className="mt-3 rounded-lg border border-white/10 bg-navy-950/60 p-3 text-xs text-steel-300">
            <p className="font-bold text-white">AI 전달용 통합 문장 미리보기</p>
            <p className="mt-1 whitespace-pre-line">{mergedPreview}</p>
          </div>
        </div>
      </section>
      )}

      {selectedTab !== "유사 사례 분석" && result && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-violet-400/30 bg-violet-500/10 p-4">
            <p className="text-xs font-black text-violet-200">1단계 · 사건 분석 결과</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-sky-300/40 px-2 py-0.5 font-black text-sky-100">목적 분류: {result.purpose}</span>
              <span className="rounded-full border border-violet-300/40 px-2 py-0.5 font-black text-violet-100">추천 면책: {result.recommendedClause.title}</span>
              <span className="rounded-full border border-emerald-300/40 px-2 py-0.5 font-black text-emerald-100">분석 완료</span>
            </div>
            <p className="mt-2 text-xs font-bold text-sky-200">적용 서식: {result.template.title}</p>
            <p className="mt-1 text-xs text-sky-300">기관 프리셋: {result.orgPreset.label} · 문서접두: {result.orgPreset.docPrefix}</p>
            <p className="mt-1 text-xs text-steel-300">{result.template.objective}</p>
            <p className="mt-2 text-sm text-steel-200">{result.recommendedClause.rationale}</p>
            <p className="mt-2 text-xs text-steel-400">RAG 소스: 법령 검색 {result.rag.lawSource} · 판례 {result.rag.precedentCount}건</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
              <h3 className="text-sm font-black text-white">유사 대법원 판례 3개</h3>
              <div className="mt-2 space-y-2">
                {result.precedents.map((p) => (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-navy-950/60 p-3 text-xs">
                    <p className="font-black text-white">{p.title}</p>
                    <p className="mt-1 text-steel-300">{p.caseNo ? `${p.caseNo} · ` : ""}{p.gist}</p>
                    <p className="mt-1 text-steel-500">출처: {p.source}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
              <h3 className="text-sm font-black text-white">유권해석 반영</h3>
              <ul className="mt-2 space-y-2 text-xs text-steel-200">
                {result.interpretations.map((i, idx) => (
                  <li key={`${i.org}-${idx}`} className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
                    <p className="font-black text-white">{i.org} · {i.topic}</p>
                    <p className="mt-1">{i.gist}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
            <h3 className="text-sm font-black text-white">표준 양식 체크리스트</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2 text-xs text-steel-200">
              {result.template.sections.map((s) => (
                <li key={s} className="rounded-xl border border-white/10 bg-navy-950/60 px-3 py-2">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
            <h3 className="text-sm font-black text-white">경제적 리스크 시뮬레이션</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
              <InfoCard label="정직 1개월 시 보수감액" value={money(result.estimate.oneMonthCut)} />
              <InfoCard label="정직 2개월 시 보수감액" value={money(result.estimate.twoMonthCut)} />
              <InfoCard label="방어비용+감액+벌금(최악치)" value={money(result.estimate.totalWorst)} />
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-navy-900/55 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-white">2단계 · 서식 문서</h3>
              <button onClick={() => navigator.clipboard.writeText(result.html)} className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-bold text-steel-200">HTML 복사</button>
              <button onClick={downloadHtml} className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-200">HTML 다운로드</button>
              <button onClick={printHtml} className="rounded-lg border border-sky-300/40 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-200">PDF 출력</button>
            </div>
            <div className="rounded-xl border border-white/10 bg-white p-4 text-black" dangerouslySetInnerHTML={{ __html: result.html }} />
            <p className="mt-2 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-200">
              법적 효력 안내: {result.disclaimer}
            </p>
          </div>
        </section>
      )}
        </>
      )}
    </div>
  );
}

function GuideInput({
  q,
  value,
  onChange,
  placeholder,
}: {
  q: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block text-xs">
      <span className="font-bold text-steel-200">{q}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-navy-950/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/45"
        placeholder={placeholder}
      />
    </label>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-950/60 p-3">
      <p className="text-steel-300">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

// 클라이언트 판례 검색용 키워드 추출 (lib/law-api.ts의 서버 전용 버전과 동일 로직)
function extractQueryKeywords(text: string): string {
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
