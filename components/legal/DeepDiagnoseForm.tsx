"use client";

/**
 *  components/legal/DeepDiagnoseForm.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   심층 진단 모드 입력 폼 + 결과 PDF 리포트 뷰.
 *   - 구조화 컨텍스트 입력 → /api/law/deep-analyze 호출
 *   - 결과: 예상 처분 게이지 + 증거 체크리스트 + 발언 가이드
 *           + 공익신고자 보호 플레이북 + 보복 방어책 + 24/72/7d 타임라인
 */

import { useState } from "react";
import { searchPrecedentsClient } from "@/lib/law-api-client";
import {
  FileText,
  Loader2,
  ShieldAlert,
  Scale,
  Clock,
  Eye,
  Volume2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  MessagesSquare,
  Sparkles,
  Printer,
} from "lucide-react";

type PredictedDiscipline = {
  type: string;
  probability: number;
  reasoning: string;
};
type DefenseBrief = {
  situationSummary: string;
  predictedDiscipline: PredictedDiscipline[];
  evidenceChecklist: Array<{
    action: string;
    why: string;
    priority: "high" | "medium" | "low";
  }>;
  languageCautions: Array<{ situation: string; dont: string; do: string }>;
  whistleblowerPlaybook: Array<{ step: string; detail: string; lawRef?: string }>;
  retaliationDefense: Array<{ risk: string; countermeasure: string }>;
  timeline: Array<{ window: string; actions: string[] }>;
  activeAdminImmunity?: {
    applicable: boolean;
    confidence: "low" | "medium" | "high";
    rationale: string;
    requiredDocs: string[];
  };
  redLine: string;
  engine: "gemini" | "fallback";
};
type AnalysisLite = {
  riskScore: number;
  riskLevel: string;
  summary: string;
  narrative: string;
  engine: string;
  confidence: string;
  citations: Array<{ statute: string; clause: string; excerpt?: string }>;
};

const EVIDENCE_OPTIONS = [
  "카톡/메신저 대화",
  "이메일",
  "공문·결재 문서",
  "음성 녹음",
  "CCTV 영상",
  "영수증·명세서",
  "증언 가능 제3자",
];

export default function DeepDiagnoseForm() {
  const [form, setForm] = useState({
    situation: "",
    role: "",
    relation: "",
    frequency: "unknown" as "once" | "repeat" | "unknown",
    currentStage: "before" as
      | "before"
      | "internal-audit"
      | "investigation"
      | "disciplinary"
      | "post",
    reported: false,
    mode: "defense" as "defense" | "active-admin",
  });
  const [evidence, setEvidence] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    analysis: AnalysisLite;
    defense: DefenseBrief;
  } | null>(null);

  const toggleEvidence = (ev: string) => {
    setEvidence((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]
    );
  };

  const submit = async () => {
    if (form.situation.trim().length < 10) {
      setError("상황을 10자 이상 상세히 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // 브라우저에서 직접 law.go.kr 판례 검색 → Vercel 서버 IP 우회
      let clientPrecedents: Awaited<ReturnType<typeof searchPrecedentsClient>> = [];
      try {
        clientPrecedents = await searchPrecedentsClient(form.situation, 8);
      } catch {
        /* 실패해도 서버측 fetchLawDetail fallback 사용 */
      }

      const r = await fetch("/api/law/deep-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, evidence, clientPrecedents }),
      });
      const j = await r.json();
      if (!j.ok) {
        setError(j.message ?? j.error ?? "분석 실패");
        return;
      }
      setResult(j.data);
      setTimeout(() => {
        document
          .getElementById("defense-report")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="glass-strong rounded-3xl border border-orange-400/30 p-5 md:p-7">
        <div className="mb-1 flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-300" />
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
            Deep Diagnosis · 실전형 법률 방어·대응 모드
          </p>
          <span className="ml-auto rounded-full border border-orange-400/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black text-orange-200">
            Gemini Pro · 판례 기반
          </span>
        </div>
        <h3 className="text-lg font-black text-white md:text-xl">
          구체적 상황을 입력하면 <span className="gradient-text">법률 검토 보고서</span>{" "}
          수준으로 분석해 드립니다
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-steel-300">
          예상 처분 분포 · 증거 확보 체크리스트 · 발언 가이드 · 공익신고자 보호
          플레이북 · 보복 방어책 · 24/72/7일 단계별 액션.
        </p>

        {/* INPUTS */}
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-black text-steel-200">
              사건 개요 <span className="text-orange-400">*</span>
            </label>
            <textarea
              value={form.situation}
              onChange={(e) => setForm({ ...form, situation: e.target.value })}
              placeholder="예) 계약 평가 담당입니다. 평소 업무 관계가 있는 업체 대표가 자택에 명절 한우세트(50만원 상당)를 보냈습니다. 박스는 열지 않았고, 배송기사 확인만 했습니다. 아직 내부에 알리지 않은 상태입니다."
              rows={4}
              className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-sm text-white placeholder-steel-500 focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TextInput
              label="직무 유형"
              value={form.role}
              onChange={(v) => setForm({ ...form, role: v })}
              placeholder="예: 계약/인사/감사/민원"
            />
            <TextInput
              label="상대방과의 관계"
              value={form.relation}
              onChange={(v) => setForm({ ...form, relation: v })}
              placeholder="예: 직무관련자/친족/상급자"
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Select
              label="반복성"
              value={form.frequency}
              onChange={(v) =>
                setForm({
                  ...form,
                  frequency: v as typeof form.frequency,
                })
              }
              options={[
                { value: "once", label: "1회" },
                { value: "repeat", label: "반복됨" },
                { value: "unknown", label: "불명확" },
              ]}
            />
            <Select
              label="현재 단계"
              value={form.currentStage}
              onChange={(v) =>
                setForm({
                  ...form,
                  currentStage: v as typeof form.currentStage,
                })
              }
              options={[
                { value: "before", label: "미발각·결정 전" },
                { value: "internal-audit", label: "내부 감사 진행" },
                { value: "investigation", label: "수사 개시" },
                { value: "disciplinary", label: "징계위원회 회부" },
                { value: "post", label: "처분 후 이의 준비" },
              ]}
            />
            <Select
              label="분석 모드"
              value={form.mode}
              onChange={(v) =>
                setForm({
                  ...form,
                  mode: v as typeof form.mode,
                })
              }
              options={[
                { value: "defense", label: "방어 모드 (징계·처분 대응)" },
                { value: "active-admin", label: "적극행정 면책 모드" },
              ]}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-black text-steel-200">
              보유 증거 (중복 선택)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EVIDENCE_OPTIONS.map((ev) => {
                const on = evidence.includes(ev);
                return (
                  <button
                    key={ev}
                    type="button"
                    onClick={() => toggleEvidence(ev)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                      on
                        ? "border-orange-400/60 bg-orange-500/20 text-orange-100"
                        : "border-white/10 bg-navy-900/60 text-steel-300 hover:border-orange-400/30"
                    }`}
                  >
                    {on ? "✓ " : ""}
                    {ev}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-navy-900/40 px-3 py-2 text-[12px] text-steel-200">
            <input
              type="checkbox"
              checked={form.reported}
              onChange={(e) => setForm({ ...form, reported: e.target.checked })}
              className="h-3.5 w-3.5 accent-orange-500"
            />
            내부 청렴신고·고충처리 접수 완료 상태
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] font-bold text-rose-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-5 py-3 text-sm font-black text-white orange-glow disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                판례·조문 교차 분석 중…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                법률 검토 보고서 생성
              </>
            )}
          </button>
        </div>
      </section>

      {loading && (
        <div className="glass rounded-3xl p-6">
          <div className="space-y-3">
            {["국가법령정보 API 에서 관련 조문 원문 수집", "규칙 엔진 1차 리스크 스코어링", "Gemini Pro 로 처분 수위·대응 시나리오 생성", "공익신고자 보호·보복 방어 플레이북 구성"].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="h-2 w-2 rounded-full bg-orange-400"
                  style={{
                    animation: `echo-chest 1.6s ease-in-out infinite`,
                    animationDelay: `${i * 0.35}s`,
                  }}
                />
                <p className="text-[12px] font-bold text-steel-200">{step}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {result && !loading && (
        <DefenseReport analysis={result.analysis} brief={result.defense} />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  PDF 리포트 스타일 뷰
 * ───────────────────────────────────────────────────────────────────── */

function DefenseReport({
  analysis,
  brief,
}: {
  analysis: AnalysisLite;
  brief: DefenseBrief;
}) {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <article
      id="defense-report"
      className="glass-strong space-y-6 rounded-3xl border border-orange-400/40 p-6 md:p-8"
    >
      {/* 문서 헤더 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-400/30 pb-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
            Ethics-Core AI · Legal Defense Brief
          </p>
          <h2 className="mt-2 text-2xl font-black text-white md:text-[28px]">
            법률 검토 보고서
          </h2>
          <p className="mt-1 text-[12px] text-steel-300">
            발행 {today} · 엔진 분석 {analysis.engine} / 방어 브리프 {brief.engine}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-bold text-steel-200 hover:text-white"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF 인쇄
          </button>
        </div>
      </header>

      {/* 상단: 리스크 & 상황 요약 */}
      <div className="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <RiskSummaryCard
          risk={analysis.riskScore}
          level={analysis.riskLevel}
        />
        <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
            Executive Summary
          </p>
          <p className="mt-2 text-sm leading-relaxed text-steel-100">
            {brief.situationSummary}
          </p>
          <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2">
            <p className="flex items-start gap-2 text-[12.5px] font-bold leading-relaxed text-rose-100">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
              <span>
                <b className="text-rose-200">RED LINE.</b> {brief.redLine}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* 예상 처분 분포 */}
      <ReportSection
        title="01. 예상 처분 수위 분포"
        icon={<Scale className="h-4 w-4 text-orange-300" />}
        desc="실제 유사 판례·징계 통계 기반 확률 분포"
      >
        <DisciplineGauge list={brief.predictedDiscipline} />
      </ReportSection>

      {/* 증거 체크리스트 */}
      <ReportSection
        title="02. 증거 확보 체크리스트"
        icon={<Eye className="h-4 w-4 text-orange-300" />}
        desc="지금 즉시 확보해야 할 것과 절대 삭제하면 안 되는 것"
      >
        <ul className="space-y-2">
          {brief.evidenceChecklist.map((e, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-navy-900/50 px-4 py-3"
            >
              <span
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-black ${
                  e.priority === "high"
                    ? "bg-rose-500/20 text-rose-200"
                    : e.priority === "medium"
                      ? "bg-orange-500/20 text-orange-200"
                      : "bg-sky-500/20 text-sky-200"
                }`}
              >
                {e.priority === "high" ? "!" : e.priority === "medium" ? "◎" : "○"}
              </span>
              <div>
                <p className="text-[13px] font-bold text-white">{e.action}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-steel-300">
                  {e.why}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </ReportSection>

      {/* 발언 가이드 */}
      <ReportSection
        title="03. 발언·기록 조심 가이드"
        icon={<Volume2 className="h-4 w-4 text-orange-300" />}
        desc="조사·면담·일상 대화에서의 말 한 마디가 증거가 됩니다"
      >
        <div className="grid gap-3 md:grid-cols-2">
          {brief.languageCautions.map((l, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-navy-900/50 p-4"
            >
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
                {l.situation}
              </p>
              <div className="mt-2 space-y-2">
                <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-300">
                    ✗ DON&apos;T
                  </p>
                  <p className="mt-0.5 text-[12px] text-rose-100">{l.dont}</p>
                </div>
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    ✓ DO
                  </p>
                  <p className="mt-0.5 text-[12px] text-emerald-100">{l.do}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </ReportSection>

      {/* 공익신고자 보호 */}
      <ReportSection
        title="04. 공익신고자 보호 플레이북 (판례 기반)"
        icon={<Shield className="h-4 w-4 text-emerald-300" />}
        desc="조문 나열이 아닌, 실제로 이렇게 해서 신분 보장을 받았다는 경로"
      >
        <ol className="space-y-2">
          {brief.whistleblowerPlaybook.map((w, i) => (
            <li
              key={i}
              className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-4"
            >
              <p className="text-[13px] font-black text-emerald-100">
                {w.step}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-steel-100">
                {w.detail}
              </p>
              {w.lawRef && (
                <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                  <Scale className="h-3 w-3" />
                  {w.lawRef}
                </p>
              )}
            </li>
          ))}
        </ol>
      </ReportSection>

      {/* 보복 방어책 */}
      <ReportSection
        title="05. 조직 내 보복·표적감사 방어책"
        icon={<ShieldAlert className="h-4 w-4 text-rose-300" />}
        desc="왕따·표적 감사·인사 불이익 — 현실 문제에 대한 실질적 대응"
      >
        <div className="grid gap-2">
          {brief.retaliationDefense.map((r, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-xl border border-white/10 bg-navy-900/50 p-4 md:grid-cols-[1fr_1.2fr]"
            >
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-300">
                  Risk
                </p>
                <p className="mt-1 text-[12.5px] font-bold text-white">
                  {r.risk}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">
                  Countermeasure
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-steel-100">
                  {r.countermeasure}
                </p>
              </div>
            </div>
          ))}
        </div>
      </ReportSection>

      {/* 타임라인 */}
      <ReportSection
        title="06. 단계별 액션 타임라인"
        icon={<Clock className="h-4 w-4 text-orange-300" />}
        desc="24시간 → 72시간 → 7일 → 30일 단위 체크리스트"
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {brief.timeline.map((t) => (
            <div
              key={t.window}
              className="relative rounded-2xl border border-orange-400/30 bg-gradient-to-b from-orange-950/30 to-navy-900/80 p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500/20 text-[11px] font-black text-orange-200">
                  {t.window}
                </span>
                <p className="text-[11px] font-black text-white">
                  {t.window === "24h"
                    ? "First 24 Hours"
                    : t.window === "72h"
                      ? "First 72 Hours"
                      : t.window === "7d"
                        ? "First 7 Days"
                        : "First 30 Days"}
                </p>
              </div>
              <ul className="space-y-1.5">
                {t.actions.map((a, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[11.5px] leading-relaxed text-steel-100"
                  >
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-orange-300" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ReportSection>

      {/* 적극행정 면책 (모드별) */}
      {brief.activeAdminImmunity && (
        <ReportSection
          title="07. 적극행정 면책 적용 가능성"
          icon={<Sparkles className="h-4 w-4 text-orange-300" />}
          desc="공공감사에 관한 법률 제23조의2 기준 분석"
        >
          <div className="rounded-2xl border border-orange-400/30 bg-gradient-to-br from-navy-900/80 to-orange-950/30 p-5">
            <div className="mb-3 flex items-center gap-3">
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                  brief.activeAdminImmunity.applicable
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-200"
                }`}
              >
                {brief.activeAdminImmunity.applicable
                  ? "적용 가능"
                  : "적용 곤란"}
              </span>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold text-steel-200">
                신뢰도 {brief.activeAdminImmunity.confidence}
              </span>
            </div>
            <p className="text-[12.5px] leading-relaxed text-steel-100">
              {brief.activeAdminImmunity.rationale}
            </p>
            <div className="mt-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
                필수 구비 서류
              </p>
              <ul className="mt-2 space-y-1">
                {brief.activeAdminImmunity.requiredDocs.map((d, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[12px] text-steel-100"
                  >
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-orange-400" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ReportSection>
      )}

      {/* 법령 근거 (하단) */}
      {analysis.citations.length > 0 && (
        <ReportSection
          title="부록. 핵심 법령 근거"
          icon={<Scale className="h-4 w-4 text-orange-300" />}
          desc="이 보고서 전반에 인용된 조문"
        >
          <div className="grid gap-2 md:grid-cols-2">
            {analysis.citations.map((c, i) => (
              <div
                key={i}
                className="rounded-xl border border-white/10 bg-navy-900/50 px-3 py-2 text-[12px]"
              >
                <p className="font-bold text-white">{c.statute}</p>
                <p className="text-steel-300">{c.clause}</p>
                {c.excerpt && (
                  <p className="mt-1 border-l-2 border-orange-500/40 pl-2 text-[11px] italic text-steel-400">
                    {c.excerpt}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      <footer className="border-t border-white/10 pt-4 text-center">
        <p className="text-[11px] text-steel-400">
          이 보고서는 Ethics-Core AI 2.0 의 자동 분석 결과입니다. 개별 사안의
          법적 판단은 변호사·법률 자문을 병행하시기 바랍니다.
        </p>
        <p className="mt-1 flex items-center justify-center gap-1 text-[10px] text-orange-300/80">
          <MessagesSquare className="h-3 w-3" />
          국가법령정보 API + Gemini Pro · 상담 내역 자동 저장
        </p>
      </footer>
    </article>
  );
}

/* ─── sub components ─────────────────────────────────────────────── */

function ReportSection({
  title,
  icon,
  desc,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ breakInside: "avoid", pageBreakInside: "avoid" }}>
      <div className="mb-3 flex items-start gap-3 border-b border-white/5 pb-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500/15">
          {icon}
        </span>
        <div>
          <h3 className="text-[14px] font-black text-white md:text-[15px]">
            {title}
          </h3>
          {desc && (
            <p className="text-[11.5px] leading-snug text-steel-400">{desc}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

function RiskSummaryCard({ risk, level }: { risk: number; level: string }) {
  const color =
    risk >= 85
      ? "#ff2d55"
      : risk >= 65
        ? "#ff4d6d"
        : risk >= 40
          ? "#ff7a1a"
          : risk > 0
            ? "#ffa24c"
            : "#5b6ea1";
  const size = 140;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (Math.max(0, risk) / 100) * circ;

  return (
    <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-5">
      <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
        종합 법적 리스크
      </p>
      <div className="mt-2 flex items-center gap-4">
        <div className="relative grid place-items-center">
          <svg width={size} height={size} className="-rotate-90">
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
            <p className="text-3xl font-black text-white">{risk}%</p>
            <p className="text-[10px] font-bold" style={{ color }}>
              {level}
            </p>
          </div>
        </div>
        <div className="flex-1 text-[12px] leading-relaxed text-steel-200">
          <p>
            <b className="text-white">즉시 조치 필요도</b> — 이 점수는 국가법령
            조문·판례 통계·규칙 엔진 기여도를 Gemini 가 교차 검토한 결과입니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function DisciplineGauge({ list }: { list: PredictedDiscipline[] }) {
  const sorted = [...list].sort((a, b) => b.probability - a.probability);
  const max = sorted[0]?.probability ?? 100;
  return (
    <div className="space-y-2">
      {sorted.map((d) => {
        const pct = d.probability;
        const tone =
          d.type.includes("파면") || d.type.includes("해임")
            ? "from-rose-500 to-rose-400"
            : d.type.includes("강등") || d.type.includes("정직")
              ? "from-orange-500 to-rose-400"
              : d.type.includes("감봉")
                ? "from-orange-400 to-yellow-400"
                : d.type.includes("표창") || d.type.includes("면책") || d.type.includes("처분없음")
                  ? "from-emerald-400 to-teal-400"
                  : "from-sky-400 to-sky-300";
        return (
          <div key={d.type} className="rounded-xl border border-white/10 bg-navy-900/50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-black text-white">{d.type}</p>
              <p className="text-[12px] font-black tabular-nums text-orange-200">
                {pct}%
              </p>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${tone}`}
                style={{
                  width: `${Math.round((pct / Math.max(1, max)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-steel-300">
              {d.reasoning}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-black text-steel-200">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white placeholder-steel-500 focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-black text-steel-200">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white focus:border-orange-400/60 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-navy-900">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
