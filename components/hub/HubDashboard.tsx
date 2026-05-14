"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import {
  FileText,
  Download,
  Presentation,
  AlertTriangle,
  ShieldCheck,
  Cpu,
  Sparkles,
  RefreshCw,
  Zap,
  MessageSquare,
  Info,
  Database,
  Brain,
  LineChart as LineChartIcon,
} from "lucide-react";
import { DEPT_DATA } from "@/lib/mock";

/** /api/integrity-metrics 응답 형상 */
type Metrics = {
  ok: true;
  generatedAt: string;
  window: string;
  kpi: {
    consultations: number;
    applications: number;
    publishedStories: number;
    avgRisk: number;
    highRiskRatio: number;
    highRiskCount: number;
  };
  trend: Array<{ date: string; count: number; avgRisk: number }>;
  scenarioBreakdown: Record<string, number>;
  riskRadar: Array<{ axis: string; value: number }>;
  departmentRisk: Array<{ department: string; score: number; count: number }>;
  dialogueSentiment: {
    positive: number;
    neutral: number;
    concern: number;
    negative: number;
  };
  dialogueHighlights: string[];
  recentConsultations: Array<{
    id: string;
    scenario: string;
    riskScore: number;
    riskLevel: string;
    engine: string;
    department: string | null;
    createdAt: string;
    promptExcerpt: string;
  }>;
  report: {
    executiveSummary: string;
    keyFindings: string[];
    risks: Array<{ title: string; severity: "low" | "med" | "high"; detail: string }>;
    recommendations: Array<{ title: string; owner: string; deadline: string }>;
    nextQuarterFocus: string[];
    engine: "gemini" | "rules";
  };
};

const SCENARIO_LABEL: Record<string, string> = {
  cheongtak: "금품·청탁",
  ihae: "이해충돌",
  gabjil: "갑질·괴롭힘",
  contract: "계약·입찰",
  retire: "퇴직·재취업",
  info: "정보 관리",
  generic: "일반 청렴",
};

export default function HubDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/integrity-metrics", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      setMetrics(json as Metrics);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    (async () => {
      try {
        const res = await fetch("/api/integrity-metrics", {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
        setMetrics(json as Metrics);
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof DOMException && e.name === "AbortError"
              ? "데이터 로딩 시간이 초과되었습니다 (10초). 잠시 후 다시 시도해주세요."
              : e instanceof Error
              ? e.message
              : "unknown";
          setError(msg);
        }
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  const overallScore = useMemo(() => {
    // 리스크가 낮을수록 청렴 점수는 높음 (100 - 평균리스크)
    if (!metrics || metrics.kpi.consultations === 0) return 83.4;
    return Math.max(40, Math.min(98, 100 - metrics.kpi.avgRisk));
  }, [metrics]);

  // 레이더: DB 데이터 + 유사기관 평균(가상) 비교
  const radarData = useMemo(() => {
    if (!metrics) return [];
    const PEER: Record<string, number> = {
      "금품·청탁": 40,
      "이해충돌": 48,
      "갑질·괴롭힘": 35,
      "계약·입찰": 45,
      "정보 관리": 30,
    };
    return metrics.riskRadar.map((r) => ({
      dim: r.axis,
      A: r.value,
      B: PEER[r.axis] ?? 35,
    }));
  }, [metrics]);

  // 부서별 — DB 우선, 없으면 mock
  const deptData = useMemo(() => {
    if (metrics && metrics.departmentRisk.length > 0) {
      return metrics.departmentRisk.map((d) => ({
        name: d.department,
        risk: d.score,
        openCases: d.count,
        trend: 0,
      }));
    }
    return DEPT_DATA;
  }, [metrics]);

  const scenarioEntries = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics.scenarioBreakdown)
      .map(([k, v]) => ({ key: k, label: SCENARIO_LABEL[k] ?? k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [metrics]);

  if (loading) {
    return <FriendlyLoadingSkeleton />;
  }

  if (!metrics && error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-2xl border border-red-400/20 bg-red-500/5 p-10 text-center">
        <p className="text-[15px] font-bold text-red-300">데이터를 불러오지 못했습니다</p>
        <p className="text-[13px] text-steel-300">{error}</p>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            load();
          }}
          className="mt-2 rounded-xl border border-sky-400/40 bg-sky-500/10 px-5 py-2 text-[13px] font-bold text-sky-200 hover:bg-sky-500/20"
        >
          새로고침
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* STATUS BAR */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-navy-900/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-xs text-steel-300">
          <Zap className="h-4 w-4 text-orange-400" />
          <span>
            지표 윈도우: <b className="text-white">{metrics?.window ?? "14d"}</b>
          </span>
          <span className="hidden md:inline">·</span>
          <span>
            생성:{" "}
            <b className="text-white">
              {metrics ? new Date(metrics.generatedAt).toLocaleString("ko-KR") : "–"}
            </b>
          </span>
          {metrics?.report.engine === "gemini" ? (
            <span className="rounded-full border border-violet-400/40 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-200">
              Gemini Report
            </span>
          ) : (
            <span className="rounded-full border border-steel-400/40 bg-steel-500/10 px-2 py-0.5 text-[10px] font-bold text-steel-300">
              Rules Report
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-rose-300">
              <AlertTriangle className="h-3 w-3" /> {error}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-bold text-orange-200 hover:bg-orange-500/20 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          새로고침
        </button>
      </div>

      {/* KPI HEADER */}
      <section className="grid gap-4 md:grid-cols-4">
        <KpiBox
          icon={ShieldCheck}
          label="종합 청렴 점수"
          value={overallScore.toFixed(1)}
          sub={
            metrics
              ? `평균리스크 ${metrics.kpi.avgRisk}% 역산`
              : "대기"
          }
          tone={overallScore >= 80 ? "good" : overallScore >= 60 ? "neutral" : "warn"}
          tip="Legal-Guide 상담 평균 리스크(%)를 역산해 100점 만점으로 환산한 기관 청렴 지수입니다. 80↑ 안전 · 60~80 주의 · 60↓ 위험."
        />
        <KpiBox
          icon={AlertTriangle}
          label="고위험 상담 비율"
          value={`${metrics?.kpi.highRiskRatio ?? 0}%`}
          sub={`${metrics?.kpi.highRiskCount ?? 0}건 / HIGH↑`}
          tone={(metrics?.kpi.highRiskRatio ?? 0) > 30 ? "warn" : "good"}
          tip="risk level이 HIGH 또는 CRITICAL 로 판정된 상담이 전체에서 차지하는 비중. 30% 이상이면 조직 단위 긴급 점검이 필요합니다."
        />
        <KpiBox
          icon={Cpu}
          label="AI 상담 분석"
          value={`${metrics?.kpi.consultations ?? 0}건`}
          sub={`신청 ${metrics?.kpi.applications ?? 0} · Drama ${metrics?.kpi.publishedStories ?? 0}`}
          tone="neutral"
          tip="14일 누적 · Legal-Guide 상담, Apply 신청, Ethics-Drama 스토리 등 플랫폼 전체 활동량 지표입니다."
        />
        <KpiBox
          icon={FileText}
          label="진단 리포트 엔진"
          value={metrics?.report.engine === "gemini" ? "Gemini" : "Rules"}
          sub={metrics?.report.engine === "gemini" ? "LLM 강화 활성" : "규칙엔진 폴백"}
          tone={metrics?.report.engine === "gemini" ? "good" : "neutral"}
          tip="Gemini Pro 가 Executive Summary / Key Findings / 추천 조치를 생성합니다. API 오류 시 규칙엔진 폴백으로 자동 전환."
        />
      </section>

      {/* TREND + RADAR */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="glass rounded-3xl p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-orange-300">
                최근 14일 상담 + 평균 리스크
              </p>
              <h3 className="flex items-center gap-2 text-lg font-black text-white">
                일별 상담 추이
                <InfoTip text="영역(주황)은 일별 상담 건수, 선은 평균 리스크(%). 주말 대비 평일 급증 또는 특정 요일 리스크 피크를 감지합니다." />
              </h3>
            </div>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
              Legal-Guide 실시간 집계
            </span>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={metrics?.trend ?? []}>
                <defs>
                  <linearGradient id="hubFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff7a1a" stopOpacity={0.7} />
                    <stop offset="100%" stopColor="#ff7a1a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#8192bf"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  stroke="#ffa24c"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#7fb4ff"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(7,12,27,0.92)",
                    border: "1px solid rgba(255,162,76,0.4)",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgRisk"
                  name="평균 리스크%"
                  stroke="#ffa24c"
                  strokeWidth={2.4}
                  fill="url(#hubFill)"
                />
                <Area
                  yAxisId="right"
                  type="monotone"
                  dataKey="count"
                  name="상담수"
                  stroke="#7fb4ff"
                  strokeWidth={2}
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <p className="text-[11px] font-bold text-orange-300">리스크 레이더 (5축)</p>
          <h3 className="text-lg font-black text-white">
            DB 기반 vs 유사 기관 평균
          </h3>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.08)" />
                <PolarAngleAxis
                  dataKey="dim"
                  tick={{ fill: "#a6b4d8", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  tick={{ fill: "#5b6ea1", fontSize: 10 }}
                  axisLine={false}
                />
                <Radar
                  name="우리 기관"
                  dataKey="A"
                  stroke="#ff7a1a"
                  fill="#ff7a1a"
                  fillOpacity={0.35}
                />
                <Radar
                  name="평균"
                  dataKey="B"
                  stroke="#7fb4ff"
                  fill="#7fb4ff"
                  fillOpacity={0.18}
                />
                <Tooltip
                  contentStyle={{
                    background: "rgba(7,12,27,0.92)",
                    border: "1px solid rgba(255,162,76,0.4)",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center justify-center gap-4 text-[11px]">
            <Legend color="#ff7a1a" label="우리 기관 (Legal-Guide)" />
            <Legend color="#7fb4ff" label="유사 기관 평균" />
          </div>
        </div>
      </section>

      {/* SCENARIO + RECENT CONSULTATIONS */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="glass rounded-3xl p-6">
          <p className="text-[11px] font-bold text-orange-300">
            Legal-Guide 시나리오 분포
          </p>
          <h3 className="text-lg font-black text-white">쟁점별 상담 수</h3>
          <div className="mt-4 space-y-2">
            {scenarioEntries.length === 0 ? (
              <p className="text-xs text-steel-400">
                아직 누적된 상담이 없습니다. Legal-Guide 에서 상담을 시작하면 이곳에 바로 반영됩니다.
              </p>
            ) : (
              scenarioEntries.map((s) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-steel-200">
                    <span className="font-bold">{s.label}</span>
                    <span className="tabular-nums">{s.count}건</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-600"
                      style={{
                        width: `${Math.min(100, (s.count / Math.max(...scenarioEntries.map((x) => x.count), 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-orange-300">
                Legal-Guide ↔ Hub 데이터 파이프
              </p>
              <h3 className="text-lg font-black text-white">최근 상담 10건</h3>
            </div>
            <span className="text-[10px] text-steel-400">
              Legal-Guide 에서 상담 → Consultation DB → 이 표에 즉시 반영
            </span>
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {metrics?.recentConsultations.length ? (
              <ul className="space-y-2">
                {metrics.recentConsultations.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-white/5 bg-navy-900/50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white">
                        {SCENARIO_LABEL[c.scenario] ?? c.scenario}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                          c.riskLevel === "CRITICAL" || c.riskLevel === "HIGH"
                            ? "bg-rose-500/20 text-rose-200"
                            : c.riskLevel === "MEDIUM"
                              ? "bg-orange-500/20 text-orange-200"
                              : "bg-emerald-500/20 text-emerald-200"
                        }`}
                      >
                        {c.riskScore}% · {c.riskLevel}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-steel-300">
                      {c.promptExcerpt}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-[10px] text-steel-500">
                      <span>{new Date(c.createdAt).toLocaleString("ko-KR")}</span>
                      <span>·</span>
                      <span>
                        {c.engine === "gemini+rules" ? "Gemini+Rules" : "Rules"}
                      </span>
                      {c.department && (
                        <>
                          <span>·</span>
                          <span>{c.department}</span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-steel-400">
                Legal-Guide 에서 첫 상담을 완료하면 여기에 자동으로 표시됩니다.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* DEPT HEATMAP + AUTO REPORT */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-orange-300">
                부서별 리스크 히트
              </p>
              <h3 className="text-lg font-black text-white">
                실시간 부패 리스크 지수
              </h3>
            </div>
            <span className="text-[11px] text-steel-400">
              {metrics && metrics.departmentRisk.length > 0
                ? "DB 실데이터"
                : "샘플 데이터 (상담 부서 입력 시 실데이터로 전환)"}
            </span>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deptData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="#a6b4d8"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  stroke="#8192bf"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(255,162,76,0.08)" }}
                  contentStyle={{
                    background: "rgba(7,12,27,0.92)",
                    border: "1px solid rgba(255,162,76,0.4)",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="risk" radius={[8, 8, 0, 0]}>
                  {deptData.map((d, i) => (
                    <Cell
                      key={i}
                      fill={
                        d.risk >= 70 ? "#ff4d6d" : d.risk >= 40 ? "#ff7a1a" : "#3ddc97"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-strong rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-400" />
            <h3 className="text-sm font-black text-white">AI 진단 리포트</h3>
            <span
              className={`ml-auto rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                metrics?.report.engine === "gemini"
                  ? "border-violet-400/40 bg-violet-500/10 text-violet-200"
                  : "border-steel-400/40 bg-steel-500/10 text-steel-200"
              }`}
            >
              {metrics?.report.engine === "gemini" ? "Gemini" : "Rules"}
            </span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-steel-200">
            {metrics?.report.executiveSummary ?? "요약 준비 중…"}
          </p>

          <div className="mt-4 space-y-2">
            {metrics?.report.keyFindings.slice(0, 4).map((k, i) => (
              <div
                key={i}
                className="flex gap-2 rounded-xl border border-white/5 bg-navy-900/50 px-3 py-2 text-[11px] text-steel-100"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                <span>{k}</span>
              </div>
            ))}
          </div>

          {metrics?.report.recommendations && metrics.report.recommendations.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-bold text-orange-300">
                추천 조치
              </p>
              <ul className="space-y-1.5 text-[11px]">
                {metrics.report.recommendations.slice(0, 3).map((r, i) => (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-2 border-b border-white/5 pb-1.5 last:border-0 last:pb-0"
                  >
                    <span className="font-bold text-white">{r.title}</span>
                    <span className="shrink-0 text-[10px] text-steel-400">
                      {r.owner} · {r.deadline}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 grid gap-2">
            <button
              type="button"
              onClick={load}
              className="flex items-center justify-between rounded-xl border border-orange-400/30 bg-gradient-to-r from-navy-700 to-orange-550 px-4 py-3 text-white"
            >
              <span className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-black">리포트 재생성</span>
              </span>
              <span className="text-[11px] font-bold opacity-90">
                Gemini + DB
              </span>
            </button>
            <button
              type="button"
              className="flex items-center justify-between rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 text-white hover:border-orange-400/40"
            >
              <span className="flex items-center gap-2">
                <Presentation className="h-4 w-4 text-orange-300" />
                <span className="text-sm font-black">교육용 PPT</span>
              </span>
              <span className="text-[11px] font-bold text-steel-300">
                PPTX · 개발 예정
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* DIALOGUE HIGHLIGHTS */}
      {metrics && (metrics.dialogueHighlights.length > 0 ||
        Object.values(metrics.dialogueSentiment).some((v) => v > 0)) && (
        <section className="glass rounded-3xl p-6">
          <div className="mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-orange-400" />
            <h3 className="text-lg font-black text-white">Dialogue 하이라이트</h3>
            <span className="text-[10px] text-steel-400">
              (토론 현장 피드백 → Hub 반영)
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_1.6fr]">
            <div className="grid grid-cols-2 gap-2">
              <SentimentChip label="긍정" value={metrics.dialogueSentiment.positive} color="#3ddc97" />
              <SentimentChip label="중립" value={metrics.dialogueSentiment.neutral} color="#7fb4ff" />
              <SentimentChip label="우려" value={metrics.dialogueSentiment.concern} color="#ffa24c" />
              <SentimentChip label="부정" value={metrics.dialogueSentiment.negative} color="#ff4d6d" />
            </div>
            <ul className="space-y-1.5 text-[11px] text-steel-200">
              {metrics.dialogueHighlights.length > 0 ? (
                metrics.dialogueHighlights.map((h, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/5 bg-navy-900/50 px-3 py-2"
                  >
                    {h}
                  </li>
                ))
              ) : (
                <li className="text-steel-400">
                  토론 세션에서 의견이 수집되면 여기에 반영됩니다.
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      <div className="hidden">
        <Download />
      </div>
    </div>
  );
}

function KpiBox({
  icon: Icon,
  label,
  value,
  sub,
  tone,
  tip,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warn" | "neutral";
  tip?: string;
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-orange-300"
        : "text-steel-300";
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 text-orange-400" />
        <span className={`text-[11px] font-bold ${color}`}>{sub}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 flex items-center gap-1 text-[11px] text-steel-300">
        {label}
        {tip && <InfoTip text={tip} />}
      </p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-steel-300">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function SentimentChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2 text-center"
      style={{
        borderColor: color + "55",
        background: color + "14",
      }}
    >
      <p className="text-[10px] font-bold" style={{ color }}>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-black text-white">{value}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  FriendlyLoadingSkeleton — "통합 지표 수집 중"도 친절해야 합니다
 * ───────────────────────────────────────────────────────────────────── */

function FriendlyLoadingSkeleton() {
  const STEPS = [
    {
      icon: Database,
      label: "Legal-Guide 상담 데이터 집계",
      desc: "최근 14일 riskScore · riskLevel 스냅샷",
    },
    {
      icon: MessageSquare,
      label: "Dialogue 세션 감정 분석 반영",
      desc: "라이브 세션의 긍정·부정·중립 비율 병합",
    },
    {
      icon: Brain,
      label: "Gemini Pro 경영진 요약 생성",
      desc: "Risk radar + 부서 편차 → Executive Summary",
    },
    {
      icon: LineChartIcon,
      label: "14일 추이 & 부서 히트맵 렌더",
      desc: "차트 뷰포트 초기화 중",
    },
  ];
  return (
    <div className="space-y-4">
      <div className="glass-strong rounded-3xl p-6 md:p-7">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-orange-400/30 border-t-orange-400" />
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
              Intelligence Hub · Preparing Report
            </p>
            <p className="mt-1 text-sm font-bold text-white">
              통합 지표를 수집하고 있습니다. 잠시만 기다려 주세요.
            </p>
            <p className="text-[11.5px] text-steel-300">
              Legal-Guide 상담 · Dialogue 감정 · Apply 신청 데이터를 Gemini 가
              교차 분석합니다 (보통 2~4초 소요).
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded-2xl border border-white/10 bg-navy-900/50 p-3"
                style={{
                  animation: "echo-chest 1.6s ease-in-out infinite",
                  animationDelay: `${i * 0.25}s`,
                }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-500/15 text-orange-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[12.5px] font-black text-white">
                    {s.label}
                  </p>
                  <p className="text-[11px] leading-snug text-steel-400">
                    {s.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 스켈레톤 카드들 */}
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl border border-white/5 bg-navy-900/40"
            style={{
              animation: "echo-chest 1.8s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div
          className="h-72 rounded-3xl border border-white/5 bg-navy-900/40"
          style={{ animation: "echo-chest 1.8s ease-in-out infinite" }}
        />
        <div
          className="h-72 rounded-3xl border border-white/5 bg-navy-900/40"
          style={{
            animation: "echo-chest 1.8s ease-in-out infinite",
            animationDelay: "0.3s",
          }}
        />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 *  InfoTip — 호버 시 짧은 설명을 보여주는 아이콘 툴팁
 *  (다른 컴포넌트에서도 재사용 가능하도록 export)
 * ───────────────────────────────────────────────────────────────────── */

export function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info className="h-3.5 w-3.5 cursor-help text-steel-400 transition-colors hover:text-orange-300" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-navy-950/95 px-3 py-2 text-[11px] font-bold leading-snug text-steel-100 opacity-0 shadow-xl backdrop-blur transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 -translate-y-0.5 border-[5px] border-transparent border-t-navy-950/95" />
      </span>
    </span>
  );
}
