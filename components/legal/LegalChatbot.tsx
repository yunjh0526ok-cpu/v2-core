"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { readAndClearHandoff } from "@/lib/chatHandoff";
import {
  Scale,
  Send,
  Sparkles,
  ShieldAlert,
  BookOpen,
  Gavel,
  Loader2,
  Database,
  AlertTriangle,
  FileDown,
  Brain,
  Lightbulb,
  CheckCircle2,
} from "lucide-react";
import LegalAnalysisCards from "@/components/legal/LegalAnalysisCards";
import LegalOnboarding from "@/components/legal/LegalOnboarding"; // onboarding-v2
import { searchPrecedentsClient } from "@/lib/law-api-client";

/**
 *  AI Legal-Guide 채팅 UI — Gemini + 국가법령 API 통합 버전
 *   - /api/law/analyze 호출
 *   - 응답은 rules+Gemini 하이브리드 (engine 필드로 구분)
 *   - 상담 결과는 서버에서 Consultation 테이블에 자동 저장 → Hub 반영
 */

type Role = "user" | "ai";
type Citation = { statute: string; clause: string; excerpt?: string };
type RelatedLaw = {
  id: string;
  name: string;
  abbr?: string;
  department?: string;
  effectiveDate?: string;
  status?: string;
};
type Factor = { label: string; delta: number; detail: string };

type Analysis = {
  prompt: string;
  riskScore: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
  narrative: string;
  keyIssues: string[];
  followUpQuestions: string[];
  citations: Citation[];
  recommendations: string[];
  relatedLaws: RelatedLaw[];
  factors: Factor[];
  mocked: boolean;
  engine: "gemini+rules" | "rules-only";
  confidence: "low" | "medium" | "high";
  source: string;
  consultationId?: string;
  enrichment?: string;
};

type Message = {
  id: string;
  role: Role;
  content: string;
  analysis?: Analysis;
  error?: string;
};

const STARTER_TEMPLATES = [
  "출장비 5만원 이하로 식사 대접 받으면 괜찮을까요?",
  "상급자가 주말에 사적 심부름을 시킵니다. 갑질인가요?",
  "우리 팀장이 가족이 운영하는 업체와 계약을 추진합니다.",
  "민원인이 명절 떡값 10만원을 주셨는데 돌려드려야 하나요?",
  "직무 관련 업체와 저녁 3만원 식사, 문제 없나요?",
  "상품권 5만원짜리를 받았는데 신고해야 하나요?",
  "배우자가 우리 부서와 거래하는 업체 임원입니다.",
  "적극행정 면책을 받으려면 어떻게 해야 하나요?",
];

/**
 *  답변 본문에서 자동 하이라이트할 법률 키워드 사전.
 *  - 길이 내림차순으로 매칭(긴 토큰 우선)해서 중첩 치환 방지.
 */
const AUTO_HIGHLIGHT_KEYWORDS = [
  "청탁금지법 시행령",
  "이해충돌방지법 시행령",
  "공직자윤리법",
  "청탁금지법",
  "이해충돌방지법",
  "부패방지권익위법",
  "공익신고자 보호법",
  "국가공무원법",
  "공공감사에 관한 법률",
  "행정규제기본법",
  "적극행정 운영규정",
  "사전컨설팅",
  "면책",
  "공익신고",
  "직무관련성",
  "이해충돌",
  "사적이해관계자",
  "부당지시",
  "갑질",
  "정직",
  "감봉",
  "견책",
  "해임",
  "파면",
  "강등",
  "경고",
  "보호",
  "방어",
  "예산",
  "혁신",
  "규제개혁",
  "규제 샌드박스",
  "공직자",
];

/**
 *  4섹션 구조 헤더 — Gemini 프롬프트가 이 헤더를 쓰도록 강제.
 *  출력에서 이 헤더를 찾아 섹션별로 분리 렌더링.
 */
const SECTION_LABELS = [
  "[상황 진단]",
  "[법령 근거]",
  "[변호사 조언]",
  "[법률 전문가 조언]",
  "[권고 조치]",
] as const;
type SectionLabel = (typeof SECTION_LABELS)[number];
type ParsedSection = { label: SectionLabel; body: string };

const WELCOME_MSG: Message = {
  id: "m0",
  role: "ai",
  content:
    "안녕하세요. Ethics-Core AI Legal-Guide 입니다. 현재 고민 중인 상황을 한 줄로 적어주세요. 국가법령정보 API로 실시간 조문을 조회하고, Gemini LLM 으로 분석을 강화하여 리스크%·근거·즉시 조치를 돌려드립니다. 상담 내역은 자동으로 Intelligence Hub 통계에 반영됩니다.",
};

/** ChatHandoff → Analysis 객체 빌더 (순수 함수, 부수효과 없음) */
function buildAnalysisFromHandoff(h: import("@/lib/chatHandoff").ChatHandoff): Analysis {
  return {
    prompt: h.question,
    riskScore: h.riskScore,
    riskLevel: h.riskLevel,
    summary: h.summary,
    narrative: h.narrative,
    keyIssues: h.keyIssues,
    followUpQuestions: [],
    citations: h.lawBasis.map((l) => ({ statute: l.statute, clause: l.clause })),
    recommendations: h.recommendations,
    relatedLaws: [],
    factors: [],
    mocked: false,
    engine: "rules-only",
    confidence: "medium",
    source: "marquee-handoff",
  };
}

export default function LegalChatbot() {
  /**
   * SSR/Hydration 안전성:
   *   messages 의 초기값은 항상 [WELCOME_MSG] (서버·클라이언트 동일).
   *   sessionStorage handoff 는 마운트 후(useEffect) 클라이언트에서만 읽고,
   *   setTimeout(0) 으로 defer → ESLint set-state-in-effect 규칙 준수.
   */
  const [messages, setMessages] = useState<Message[]>([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoSentRef = useRef(false);

  // 온보딩: WELCOME_MSG 하나만 있고 명시적으로 닫히지 않은 경우
  const showOnboarding = !onboardingDismissed && messages.length === 1 && messages[0].id === "m0";

  const searchParams = useSearchParams();

  // ── 마운트 후 handoff 주입 (클라이언트 전용, hydration safe) ──
  useEffect(() => {
    const h = readAndClearHandoff();
    if (!h) return;
    autoSentRef.current = true;
    const analysis = buildAnalysisFromHandoff(h);
    // setTimeout(0) 으로 defer → sync setState-in-effect 경고 방지
    const t = setTimeout(() => {
      setMessages([
        WELCOME_MSG,
        { id: "u-handoff", role: "user", content: h.question },
        { id: "a-handoff", role: "ai", content: h.narrative, analysis },
      ]);
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  const latestAnalysis = useMemo(
    () =>
      messages
        .filter((m) => m.role === "ai" && m.analysis)
        .at(-1)?.analysis ?? null,
    [messages]
  );

  const send = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || thinking) return;

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    try {
      // 브라우저에서 직접 law.go.kr 판례 검색 → Vercel 서버 IP 우회
      let clientPrecedents: Awaited<ReturnType<typeof searchPrecedentsClient>> = [];
      try {
        clientPrecedents = await searchPrecedentsClient(q, 8);
      } catch {
        /* 실패해도 서버측 searchRelevantPrecedents fallback 사용 */
      }

      const res = await fetch("/api/law/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, clientPrecedents }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg =
          json?.details?.[0]?.message ??
          json?.error ??
          `분석 실패 (HTTP ${res.status})`;
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: "ai",
            content: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.",
            error: String(msg),
          },
        ]);
        return;
      }
      let analysis = json.data as Analysis;

      // /api/law/analyze 응답이 빈 인용인 경우 보강 라우트를 추가 호출해 병합
      if (
        analysis.enrichment === "none" ||
        !Array.isArray(analysis.citations) ||
        analysis.citations.length === 0
      ) {
        try {
          const enrichRes = await fetch("/api/legal-guide/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: q }),
          });
          const enrichJson = await enrichRes.json();
          const extraCitations = Array.isArray(enrichJson?.data?.context?.citations)
            ? (enrichJson.data.context.citations as Citation[])
            : [];
          if (extraCitations.length > 0) {
            const merged = [...(analysis.citations ?? []), ...extraCitations];
            const deduped: Citation[] = [];
            const seen = new Set<string>();
            for (const c of merged) {
              const key = `${c.statute}|${c.clause}`;
              if (seen.has(key)) continue;
              seen.add(key);
              deduped.push(c);
            }
            analysis = { ...analysis, citations: deduped.slice(0, 12) };
          }
        } catch {
          // enrich 실패 시 기본 응답 유지
        }
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "ai",
          content: analysis.narrative || analysis.summary,
          analysis,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "ai",
          content: "네트워크 오류가 발생했습니다.",
          error: err instanceof Error ? err.message : "unknown error",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }, [input, thinking]);

  // 온보딩 칩/버튼 클릭 핸들러 — send 선언 이후에 위치해야 함
  const handleOnboardingStart = useCallback((q?: string) => {
    setOnboardingDismissed(true); // 온보딩 즉시 닫고 채팅으로 전환
    if (q) {
      send(q).catch(() => {});
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [send]);

  // URL ?q= 자동 반영 — handoff 가 없는 경우 직접 질문을 보냄
  useEffect(() => {
    if (autoSentRef.current) return;
    const q = (searchParams?.get("q") ?? "").trim();
    if (!q) return;
    autoSentRef.current = true;
    const t = setTimeout(() => {
      send(q).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, send]);

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[2fr_1fr] lg:gap-6">
      {/* CHAT PANEL */}
      <section className="glass flex h-[70vh] min-h-[520px] min-w-0 flex-col overflow-hidden rounded-3xl lg:h-[75vh]">
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-black text-white">
                AI Legal-Guide Chat
              </p>
              <p className="text-[11.5px] font-semibold text-steel-300">
                국가법령정보 API + Gemini LLM · 상담 내역 Hub 실시간 반영
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {latestAnalysis && (
              <EngineBadge engine={latestAnalysis.engine} />
            )}
            <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Online
            </span>
          </div>
        </header>

        <div className="flex-1 min-w-0 space-y-3 overflow-y-auto overflow-x-hidden p-5">
          {showOnboarding ? (
            <LegalOnboarding onStart={handleOnboardingStart} />
          ) : (
            messages.map((m) => (
              <MessageBubble key={m.id} msg={m} onFollowUp={send} />
            ))
          )}
          {thinking && <GridAnalysisLoader />}
          <div ref={endRef} />
        </div>

        <div className="border-t border-white/5 px-4 py-4 md:px-5">
          {/* ── 예시 질문 sky/violet 대형 칩 마퀴 ── */}
          <div className="chip-marquee-wrap mb-3 py-1">
            <div className="chip-marquee-track">
              {[...STARTER_TEMPLATES, ...STARTER_TEMPLATES].map((t, i) => (
                <button
                  key={`${t}-${i}`}
                  type="button"
                  onClick={() => send(t)}
                  disabled={thinking}
                  className="shrink-0 rounded-full border border-sky-300/45 bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-violet-500/20 px-5 py-2.5 text-[14px] font-black text-white shadow-[0_6px_24px_-10px_rgba(125,211,252,0.55)] transition-all hover:border-sky-300/80 hover:from-sky-500/30 hover:to-violet-500/30 disabled:opacity-50"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* ── 질문 입력: 약 20% 축소 + sky-violet 그라데이션 보더 + 글로우 ── */}
          <div className="mx-auto w-full max-w-[88%]">
            <div className="gradient-border rounded-xl bg-navy-900/80 sky-glow">
              <div className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-300" />
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="상황을 한 줄로 적어주세요 · 예) 계약 업체가 명절 선물을 보내왔습니다."
                  className="min-w-0 flex-1 bg-transparent text-[12.5px] font-semibold text-white placeholder:text-steel-500 outline-none"
                />
                <button
                  type="button"
                  onClick={() => send()}
                  disabled={thinking || input.trim().length === 0}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-2.5 py-1.5 text-[11.5px] font-black text-white sky-glow disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  분석
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ANALYSIS PANEL */}
      <section className="min-w-0 space-y-4">
        <RiskCard risk={latestAnalysis?.riskScore ?? 0} level={latestAnalysis?.riskLevel} />

        {latestAnalysis?.keyIssues && latestAnalysis.keyIssues.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-sky-300" />
              <p className="text-[14px] font-black text-white">
                <span className="accent-text">핵심 쟁점</span>
              </p>
            </div>
            <ul className="space-y-2 text-[13px] font-semibold text-white/90">
              {latestAnalysis.keyIssues.map((k, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
                  <span>{k}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-sky-300" />
            <p className="text-[14px] font-black text-white">
              <span className="accent-text">근거 법령 · 조문</span>
            </p>
          </div>
          {latestAnalysis?.citations.length ? (
            <ul className="space-y-2">
              {latestAnalysis.citations.map((c, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-sky-300/20 bg-navy-900/50 px-3 py-2.5 text-[13px]"
                >
                  <p className="font-black text-white">{c.statute}</p>
                  <p className="font-semibold text-white/80">{c.clause}</p>
                  {c.excerpt && (
                    <p className="mt-1 border-l-2 border-sky-400/60 pl-2 text-[12px] italic text-steel-200">
                      {c.excerpt}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] font-semibold text-steel-300">
              질문을 입력하면 근거 법령/조문이 자동 표기됩니다.
            </p>
          )}
        </div>

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-violet-300" />
            <p className="text-[14px] font-black text-white">
              <span className="accent-text">즉시 조치 가이드</span>
            </p>
          </div>
          {latestAnalysis?.recommendations.length ? (
            <ol className="list-decimal space-y-2 pl-4 text-[13px] font-semibold text-white/90">
              {latestAnalysis.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] font-semibold text-steel-300">
              분석 결과에 맞춘 조치 제안이 여기 표시됩니다.
            </p>
          )}
        </div>

        {latestAnalysis?.factors && latestAnalysis.factors.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-300" />
              <p className="text-[14px] font-black text-white">
                <span className="accent-text">리스크 기여도 분해</span>
              </p>
            </div>
            <ul className="space-y-1.5 text-[12px]">
              {latestAnalysis.factors.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-2 border-b border-white/5 pb-1.5 last:border-0 last:pb-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-black text-white">
                      {f.label}
                    </p>
                    <p className="truncate text-[11px] text-steel-300">
                      {f.detail}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-black tabular-nums ${
                      f.delta > 0
                        ? "text-violet-300"
                        : f.delta < 0
                          ? "text-emerald-300"
                          : "text-steel-400"
                    }`}
                  >
                    {f.delta > 0 ? "+" : ""}
                    {f.delta}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-sky-300" />
              <p className="text-[14px] font-black text-white">
                <span className="accent-text">국가법령정보 API</span>
              </p>
            </div>
            {latestAnalysis && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[10.5px] font-black ${
                  latestAnalysis.source.startsWith("law.go.kr")
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-sky-300/40 bg-sky-500/10 text-sky-200"
                }`}
              >
                {latestAnalysis.source.startsWith("law.go.kr")
                  ? "Live API"
                  : "Local KB"}
              </span>
            )}
          </div>
          {latestAnalysis?.relatedLaws.length ? (
            <ul className="space-y-2">
              {latestAnalysis.relatedLaws.map((l) => (
                <li
                  key={l.id}
                  className="rounded-xl border border-sky-300/20 bg-navy-900/50 px-3 py-2.5 text-[13px]"
                >
                  <p className="font-black text-white">
                    {l.name}
                    {l.abbr && (
                      <span className="ml-1.5 text-[11px] font-black text-sky-300">
                        [{l.abbr}]
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] text-steel-300">
                    {l.department ?? "소관부처"} · {l.status ?? ""}{" "}
                    {l.effectiveDate ? `· ${l.effectiveDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] font-semibold text-steel-300">
              질문을 보내면 law.go.kr 실시간 조회 결과가 표시됩니다.
            </p>
          )}
          {latestAnalysis?.mocked && (
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-sky-300/30 bg-sky-500/5 p-2 text-[12px] text-sky-100">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>
                실데이터가 아닌 로컬 KB 로 응답 중입니다. `.env.local` 의{" "}
                <code className="font-mono">LAW_API_KEY</code> 를 유효한 OC
                값으로 교체하면 법령 실조회가 활성화됩니다.
              </span>
            </p>
          )}
          {latestAnalysis?.consultationId && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] font-black text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              상담 ID{" "}
              <code className="font-mono">
                {latestAnalysis.consultationId.slice(0, 10)}…
              </code>{" "}
              Hub 통계에 반영됨
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function EngineBadge({ engine }: { engine: Analysis["engine"] }) {
  const gemini = engine === "gemini+rules";
  return (
    <span
      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        gemini
          ? "border-violet-400/40 bg-violet-500/10 text-violet-200"
          : "border-steel-400/40 bg-steel-500/10 text-steel-200"
      }`}
    >
      <Brain className="h-3 w-3" />
      {gemini ? "Gemini+Rules" : "Rules Only"}
    </span>
  );
}

/** 분석 결과를 새 창에서 PDF로 인쇄 */
function printLegalAnalysis(analysis: Analysis, question: string) {
  const riskColor =
    analysis.riskLevel === "CRITICAL" ? "#f472b6"
    : analysis.riskLevel === "HIGH" ? "#a78bfa"
    : analysis.riskLevel === "MEDIUM" ? "#818cf8"
    : "#38bdf8";

  const citationRows = (analysis.citations ?? [])
    .map((c) => `<tr><td>${c.statute}</td><td>${c.clause}</td><td>${c.excerpt ?? ""}</td></tr>`)
    .join("");

  const recItems = (analysis.recommendations ?? [])
    .map((r) => `<li>${r}</li>`).join("");

  const issueItems = (analysis.keyIssues ?? [])
    .map((k) => `<li>${k}</li>`).join("");

  const relatedItems = (analysis.relatedLaws ?? [])
    .map((l) => `<li><b>${l.name}</b>${l.abbr ? ` (${l.abbr})` : ""}${l.department ? ` — ${l.department}` : ""}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>LexGuard AI 법률 분석 리포트</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 32mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', Arial, sans-serif; font-size: 13px; color: #1a1a2e; line-height: 1.75; margin: 0; padding: 0; }
  header { border-bottom: 3px solid #3366cc; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22px; color: #0d1f3d; margin: 0 0 4px; }
  header .meta { font-size: 11px; color: #666; }
  .risk-badge { display: inline-block; padding: 5px 14px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-left: 8px; }
  .section { margin: 14px 0; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #3366cc; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #dde8ff; }
  .section-body { font-size: 13px; color: #1a1a2e; white-space: pre-wrap; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  th { background: #e8f0ff; color: #1a3a6e; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  ul, ol { margin: 4px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  .disclaimer { font-size: 10px; color: #999; border-top: 1px solid #ddd; margin-top: 24px; padding-top: 8px; font-style: italic; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
<header>
  <h1>⚖ LexGuard AI 법률 분석 리포트</h1>
  <div class="meta">
    분석 일시: ${new Date().toLocaleString("ko-KR")} &nbsp;|&nbsp;
    엔진: 국가법령정보 API × Gemini LLM &nbsp;|&nbsp;
    신뢰도: ${analysis.confidence ?? "-"}
    <span class="risk-badge" style="background:${riskColor}22;color:${riskColor};border:1px solid ${riskColor}55">
      ${analysis.riskLevel ?? "?"} &nbsp; ${analysis.riskScore ?? 0}%
    </span>
  </div>
</header>

<div class="section">
  <div class="section-title">📋 질문 / 상황</div>
  <div class="section-body">${question}</div>
</div>

${analysis.summary ? `<div class="section">
  <div class="section-title">📌 요약</div>
  <div class="section-body">${analysis.summary}</div>
</div>` : ""}

<div class="section">
  <div class="section-title">📄 상세 분석</div>
  <div class="section-body">${analysis.narrative ?? ""}</div>
</div>

${issueItems ? `<div class="section">
  <div class="section-title">⚠ 핵심 쟁점</div>
  <ul>${issueItems}</ul>
</div>` : ""}

${recItems ? `<div class="section">
  <div class="section-title">✅ 권고 조치</div>
  <ul>${recItems}</ul>
</div>` : ""}

${citationRows ? `<div class="section">
  <div class="section-title">📚 법령 근거</div>
  <table>
    <thead><tr><th>법령명</th><th>조문</th><th>내용</th></tr></thead>
    <tbody>${citationRows}</tbody>
  </table>
</div>` : ""}

${relatedItems ? `<div class="section">
  <div class="section-title">🔗 관련 법령</div>
  <ul>${relatedItems}</ul>
</div>` : ""}

<p class="disclaimer">
  본 분석은 국가법령정보 API 기반의 AI 자동 분석으로, 법적 효력이 없습니다.
  구체적인 사안은 반드시 전문 법률가의 조언을 받으시기 바랍니다.
  LexGuard AI — lexguardai.vercel.app
</p>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=700");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }
}

function MessageBubble({
  msg,
  onFollowUp,
}: {
  msg: Message;
  onFollowUp: (text: string) => void;
}) {
  const mine = msg.role === "user";

  // AI 분석 결과가 있는 메시지: 구조화 카드 UI로 렌더링
  const hasAnalysis = !mine && !!msg.analysis;

  // 분석 없는 AI 메시지: 기존 섹션 파서 유지
  const parsed = !mine && !hasAnalysis ? parseInstructorSections(msg.content) : null;

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-5 py-4 text-[14px] font-semibold leading-[1.75] whitespace-pre-wrap bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 text-white sky-glow">
          {msg.content}
        </div>
      </div>
    );
  }

  // ── AI 메시지 ──
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[98%] min-w-0">
        {hasAnalysis ? (
          // 구조화 카드 UI (분석 결과 있음)
          <div className="rounded-2xl border border-sky-300/15 bg-navy-900/60 p-4 md:p-5">
            <LegalAnalysisCards
              narrative={msg.content}
              riskScore={msg.analysis!.riskScore}
              riskLevel={msg.analysis!.riskLevel}
              onFollowUp={onFollowUp}
            />
            {/* 엔진 배지 + 신뢰도 */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
              <EngineBadge engine={msg.analysis!.engine} />
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-bold text-white/60">
                신뢰도 {msg.analysis!.confidence}
              </span>
            </div>
            {/* 후속 질문 칩 */}
            {msg.analysis!.followUpQuestions?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/50">
                  이어서 물어볼만한 질문
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {msg.analysis!.followUpQuestions.map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => onFollowUp(q)}
                      className="rounded-full border border-sky-300/40 bg-sky-500/10 px-2.5 py-1 text-[11.5px] font-black text-sky-100 hover:bg-sky-500/25"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* PDF 다운로드 버튼 */}
            <div className="mt-4 border-t border-white/5 pt-3">
              <button
                type="button"
                onClick={() => printLegalAnalysis(msg.analysis!, msg.analysis!.prompt)}
                className="flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/10 px-4 py-2.5 text-[13px] font-black text-violet-200 transition-all hover:border-violet-400/70 hover:bg-violet-500/20"
              >
                <FileDown className="h-4 w-4" />
                PDF 저장
              </button>
              <p className="mt-1.5 text-[10px] text-white/30">
                질문 · 분석 · 법령 근거 · 권고 조치 전체 포함
              </p>
            </div>
          </div>
        ) : parsed && parsed.length > 0 ? (
          // 기존 섹션 렌더러 (분석 없는 구조화 텍스트)
          <div className="rounded-2xl border border-sky-300/25 bg-navy-900/70 px-5 py-4">
            <InstructorRenderer sections={parsed} />
            {!mine && (
              <p className="mt-3 border-t border-white/10 pt-2 text-xs italic text-steel-400/90">
                본 분석은 국가법령정보 API 기반의 AI 자동 분석으로, 법적 효력이 없습니다. 구체적인 사안은 반드시
                전문 법률가의 조언을 받으시기 바랍니다.
              </p>
            )}
          </div>
        ) : (
          // 기본 텍스트 (웰컴 메시지 등)
          <div className="rounded-2xl border border-sky-300/25 bg-navy-900/70 px-5 py-4 text-[14px] font-semibold leading-[1.75] text-white/95 whitespace-normal break-keep">
            <HighlightedText text={msg.content} />
            {msg.error && (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-rose-300">
                <AlertTriangle className="h-3 w-3" />
                {msg.error}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RiskCard({
  risk,
  level,
}: {
  risk: number;
  level?: Analysis["riskLevel"];
}) {
  const label =
    level === "CRITICAL"
      ? "CRITICAL"
      : risk >= 70
        ? "HIGH"
        : risk >= 40
          ? "MEDIUM"
          : risk > 0
            ? "LOW"
            : "대기";
  const color =
    level === "CRITICAL" || risk >= 85
      ? "#f472b6" // neon pink (critical)
      : risk >= 65
        ? "#a78bfa" // violet
        : risk >= 40
          ? "#818cf8" // indigo
          : risk > 0
            ? "#38bdf8" // sky
            : "#5b6ea1";

  const pct = Math.max(risk, 0);
  const size = 140;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="glass-strong gradient-border min-w-0 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-[14.5px] font-black text-white">
          <span className="accent-text">종합 법적 리스크</span>
        </p>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-black"
          style={{ background: `${color}22`, color }}
        >
          {label}
        </span>
      </div>

      <div className="relative mx-auto mt-4 flex h-[140px] w-[140px] items-center justify-center">
        <svg width={140} height={140} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <p className="text-4xl font-black text-white tabular-nums">{pct}%</p>
          <p className="text-[11px] font-semibold text-white/80">
            즉시 조치 필요도
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] font-semibold text-white/70">
        국가법령 API × Gemini LLM <span className="accent-text">하이브리드 분석</span>
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  Gemini 구조화 답변 ([상황 진단] / [법령 근거] / [법률 전문가 조언] / [권고 조치])
 *  을 섹션 단위로 파싱 + 렌더링. 키워드는 자동으로 sky-violet 강조.
 * ═══════════════════════════════════════════════════════════════ */

function parseInstructorSections(raw: string): ParsedSection[] {
  if (!raw) return [];
  // 헤더가 전혀 없으면 빈 배열 → 상위에서 기본 하이라이트 렌더링
  const hasAny = SECTION_LABELS.some((l) => raw.includes(l));
  if (!hasAny) return [];

  const out: ParsedSection[] = [];
  // 모든 헤더 위치 수집 → 정렬 → 슬라이스
  const marks = SECTION_LABELS.flatMap<{ label: SectionLabel; idx: number }>(
    (l) => {
      const idx = raw.indexOf(l);
      return idx >= 0 ? [{ label: l, idx }] : [];
    }
  ).sort((a, b) => a.idx - b.idx);

  marks.forEach((m, i) => {
    const start = m.idx + m.label.length;
    const end = i + 1 < marks.length ? marks[i + 1].idx : raw.length;
    const body = raw.slice(start, end).trim();
    if (body) out.push({ label: m.label, body });
  });
  return out;
}

const SECTION_ICON: Record<SectionLabel, { emoji: string; sub: string }> = {
  "[상황 진단]": { emoji: "🧭", sub: "Situation Diagnosis" },
  "[법령 근거]": { emoji: "📜", sub: "Legal Basis" },
  "[변호사 조언]": { emoji: "⚖️", sub: "Attorney Note" },
  "[법률 전문가 조언]": { emoji: "⚖️", sub: "Legal Expert Note" },
  "[권고 조치]": { emoji: "✅", sub: "Action Guide" },
};

function InstructorRenderer({ sections }: { sections: ParsedSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((s, i) => {
        const meta = SECTION_ICON[s.label];
        const isAction = s.label === "[권고 조치]";
        return (
          <section key={i} className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg border border-sky-300/30 bg-gradient-to-r from-sky-500/12 to-violet-500/12 px-3 py-1.5">
              <span className="text-base">{meta.emoji}</span>
              <p className="text-[13.5px] font-black text-white">
                <span className="accent-text">{s.label.replace(/[[\]]/g, "")}</span>
                <span className="ml-2 text-[10.5px] font-bold uppercase tracking-widest text-white/55">
                  {meta.sub}
                </span>
              </p>
            </div>
            {isAction ? (
              <ActionList body={s.body} />
            ) : (
              <p className="px-1 text-[14px] font-semibold leading-[1.8] text-white/95 md:text-[14.5px]">
                <HighlightedText
                  text={
                    s.label === "[상황 진단]"
                      ? compressSituationSummary(s.body)
                      : s.body
                  }
                />
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ActionList({ body }: { body: string }) {
  // 줄 단위로 쪼개서 - / • / 1. / 2. 같은 마커 제거 후 번호 매김
  const items = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^\s*(?:[-•*]|[0-9]+[.)])\s*/, ""));
  if (items.length <= 1) {
    return (
      <p className="px-1 text-[14px] font-semibold leading-[1.8] text-white/95 md:text-[14.5px]">
        <HighlightedText text={body} />
      </p>
    );
  }
  return (
    <ol className="space-y-2 px-1">
      {items.map((a, i) => (
        <li
          key={i}
          className="flex items-start gap-3 rounded-xl border border-sky-300/20 bg-navy-950/40 px-3 py-2.5"
        >
          <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500/35 to-violet-500/35 text-[13px] font-black text-white">
            {i + 1}
          </span>
          <span className="text-[14px] font-semibold leading-[1.75] text-white/95 md:text-[14.5px]">
            <HighlightedText text={a} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function compressSituationSummary(body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text) return body;
  const sentences = text
    .split(/(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length >= 2) {
    const compact = `${sentences[0]} ${sentences[1]}`.trim();
    return compact.length > 150 ? `${compact.slice(0, 147)}...` : compact;
  }
  return text.length > 130 ? `${text.slice(0, 127)}...` : text;
}

/**
 *  AUTO_HIGHLIGHT_KEYWORDS 사전 + "제N조" 패턴 + "XX만원·X원" 금액 패턴을
 *  자동으로 sky-violet 그라데이션으로 강조.
 */
function HighlightedText({ text }: { text: string }) {
  if (!text) return null;
  // 길이 내림차순 정렬 → 긴 토큰 먼저 매칭
  const sorted = [...AUTO_HIGHLIGHT_KEYWORDS].sort((a, b) => b.length - a.length);

  // 1) 정규식 이스케이프
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keywordAlt = sorted.map(esc).join("|");
  // 2) "제N조" / "제N조의M" / "N만원" / "N천원" 패턴
  const extraPat = "제\\s*\\d+\\s*조(?:의\\s*\\d+)?|\\d+(?:,\\d{3})*(?:\\.\\d+)?\\s*(?:만원|천원|원|%)";
  const pattern = new RegExp(`(${keywordAlt}|${extraPat})`, "g");

  const out: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > lastIdx) {
      out.push(<span key={`t-${key++}`}>{text.slice(lastIdx, m.index)}</span>);
    }
    out.push(
      <b
        key={`h-${key++}`}
        className="accent-text"
        style={{ fontWeight: 900 }}
      >
        {m[0]}
      </b>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    out.push(<span key={`t-${key++}`}>{text.slice(lastIdx)}</span>);
  }
  return <>{out}</>;
}

/* ═══════════════════════════════════════════════════════════════
 *  분석 대기 — '10만 건 정밀 분석' AI 그리드 애니메이션
 * ═══════════════════════════════════════════════════════════════ */
function GridAnalysisLoader() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-950/40 via-navy-900/80 to-violet-950/40 px-5 py-5 sky-glow">
      <div className="grid-analysis-bg pointer-events-none absolute inset-0 opacity-80" />
      <div className="relative flex items-center gap-3">
        <div className="relative grid h-11 w-11 shrink-0 place-items-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/30" />
          <Loader2 className="h-6 w-6 animate-spin text-sky-300" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-black text-white md:text-[15px]">
            <span className="accent-text">
              AI가 국가법령 및 판례 10만 건을 정밀 분석 중입니다…
            </span>
          </p>
          <p className="mt-0.5 truncate text-[11.5px] font-semibold text-white/75">
            국가법령정보 API 조회 → 조문 매칭 → 판례 가중치 → Gemini Pro 해석
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StreamTick label="조문 스캔" />
            <StreamTick label="판례 매칭" />
            <StreamTick label="리스크 가중치" />
            <StreamTick label="변호사 조언 생성" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamTick({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sky-300/30 bg-navy-900/60 px-2 py-0.5 text-[10.5px] font-black text-sky-100">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
      {label}
    </span>
  );
}
