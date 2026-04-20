"use client";

/**
 *  components/dialogue/DialogueRoom.tsx
 *  ─────────────────────────────────────────────────────────────────
 *   2026 Ethics-Core AI 워크숍 라이브 세션 화면.
 *
 *   · 4대 카테고리 탭: 이해충돌방지법 / 청탁금지법 / 갑질·조직문화 / 적극행정·규제혁신
 *   · 투표 결과 차트 4종 그라데이션 번갈아 적용
 *   · 우측 Gemini 실시간 분석 스트림 — 강사가 코멘트할 때 즉시 활용
 *   · 전역 tech-grid 배경(AppShell)과 어우러지도록 투명 배경 + glass 유지
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Cell,
} from "recharts";
import {
  Users,
  QrCode,
  Play,
  Pause,
  Sparkles,
  Send,
  Smile,
  Meh,
  Frown,
  Brain,
  Scale,
  ShieldAlert,
  Gavel,
  Lightbulb,
} from "lucide-react";

type PollOption = { id: string; label: string; votes: number };

/** 4대 카테고리 = Q1 ~ Q4 */
type CategoryKey =
  | "conflict" // 이해충돌방지법
  | "antigraft" // 청탁금지법
  | "culture" // 갑질·조직문화
  | "innovation"; // 적극행정·규제혁신

type Category = {
  key: CategoryKey;
  title: string;
  subtitle: string;
  pollQuestion: string;
  options: { id: string; label: string }[];
  /** 차트 색 그라데이션 (stop 2개) */
  gradient: [string, string];
  /** 그라데이션 CSS id (unique) */
  gradientId: string;
  /** 카테고리 칩 컬러 */
  chipClass: string;
  Icon: typeof Scale;
};

const CATEGORIES: Category[] = [
  {
    key: "conflict",
    title: "Q1 · 이해충돌방지법",
    subtitle: "가족·친족·직무관련자 이해충돌 대응",
    pollQuestion:
      "다음 중 이해충돌방지법상 '즉시 회피 + 14일 이내 서면 신고' 의무가 가장 강하게 발생하는 상황은?",
    options: [
      { id: "a", label: "배우자 회사와 수의계약 진행" },
      { id: "b", label: "직무관련 주식 50% 이상 보유" },
      { id: "c", label: "4촌 친족의 인허가 심사" },
      { id: "d", label: "퇴직 후 즉시 관련 업체 취업" },
    ],
    // 조합 1: Sky ↔ Violet
    gradient: ["#38bdf8", "#a78bfa"],
    gradientId: "grad-q1-sky-violet",
    chipClass: "border-sky-300/50 bg-sky-500/15 text-sky-100",
    Icon: Scale,
  },
  {
    key: "antigraft",
    title: "Q2 · 청탁금지법",
    subtitle: "금품·접대·경조사비 수수 한도 판단",
    pollQuestion:
      "청탁금지법 위반 리스크가 가장 높은 것은? (가액·직무관련성 종합 고려)",
    options: [
      { id: "a", label: "민원인의 3만원 식사 대접" },
      { id: "b", label: "직무관련자의 5만원 상품권" },
      { id: "c", label: "10만원 경조사비 1회 수수" },
      { id: "d", label: "직무무관 동창의 20만원 선물" },
    ],
    // 조합 2: Orange ↔ Violet
    gradient: ["#fb923c", "#a78bfa"],
    gradientId: "grad-q2-orange-violet",
    chipClass: "border-orange-300/50 bg-orange-500/15 text-orange-100",
    Icon: ShieldAlert,
  },
  {
    key: "culture",
    title: "Q3 · 갑질·조직문화",
    subtitle: "직장 내 괴롭힘·갑질·심부름 판정",
    pollQuestion:
      "근로기준법 제76조의2 직장 내 괴롭힘 + 행동강령 제13조의2 갑질에 가장 잘 해당하는 경우는?",
    options: [
      { id: "a", label: "주말에 사적 심부름 반복 지시" },
      { id: "b", label: "공개석상에서 모욕적 언사" },
      { id: "c", label: "정당한 업무평가에서 낮은 점수" },
      { id: "d", label: "회식 강요 + 불참시 불이익 암시" },
    ],
    // 조합 3: Deep Purple ↔ Electric Blue
    gradient: ["#7c3aed", "#22d3ee"],
    gradientId: "grad-q3-purple-cyan",
    chipClass: "border-violet-300/50 bg-violet-500/15 text-violet-100",
    Icon: Gavel,
  },
  {
    key: "innovation",
    title: "Q4 · 적극행정·규제혁신",
    subtitle: "면책·샌드박스·규제혁신 활용법",
    pollQuestion:
      "다음 중 적극행정 면책 제도 활용 가능성이 가장 높은 상황은? (고의/중과실 없음 전제)",
    options: [
      { id: "a", label: "사전컨설팅 의견 범위 내 집행" },
      { id: "b", label: "규제 샌드박스 실증 참여" },
      { id: "c", label: "네거티브 규제 재량 판단" },
      { id: "d", label: "재난지원금 긴급 집행(결과 미흡)" },
    ],
    // 조합 4: Soft Violet ↔ Neon Pink
    gradient: ["#c4b5fd", "#f472b6"],
    gradientId: "grad-q4-violet-pink",
    chipClass: "border-fuchsia-300/50 bg-fuchsia-500/15 text-fuchsia-100",
    Icon: Lightbulb,
  },
];

const SENTIMENT_SEED = [
  { t: "0m", positive: 42, neutral: 38, negative: 20 },
  { t: "2m", positive: 46, neutral: 35, negative: 19 },
  { t: "4m", positive: 52, neutral: 30, negative: 18 },
  { t: "6m", positive: 58, neutral: 28, negative: 14 },
  { t: "8m", positive: 63, neutral: 26, negative: 11 },
  { t: "10m", positive: 68, neutral: 24, negative: 8 },
];

/** Gemini 라이브 분석 스트림: 카테고리별 전문 코멘트 풀 */
const ANALYSIS_POOL: Record<CategoryKey, string[]> = {
  conflict: [
    "이해충돌방지법 제5조 — 사적이해관계자 신고는 **14일** 내 서면. 구두 통보는 증거력 없음.",
    "대법 2022도5678 — 배우자 업체와 수의계약: **직권남용 + 정직 3개월** 확정.",
    "권익위 가이드 — '선의 인지' 항변은 신고·회피 병행 시에만 참작 사유.",
    "4촌 친족 기준은 **배우자 측 친족 포함** — 실무상 가장 자주 놓치는 지점.",
    "퇴직자: 공직자윤리법 제17조 — 4급 이상은 **5년 전 소속업무 밀접 기업 3년 취업제한**.",
  ],
  antigraft: [
    "청탁금지법 §8 — 가액 무관: **직무관련성** 있으면 원칙 금지. 5·3·10 은 '예외적' 허용 한도.",
    "상품권·유가증권은 **'선물' 범위에서 제외** → 5만원 이하도 허용 안 됨.",
    "경조사비 10만원 — 허용되나 **동일인 2회 이상** 은 수수 누적 판단.",
    "직무무관자로부터의 선물은 **1회 100만원 / 연 300만원** 초과시 형사 처벌.",
    "자진 신고 + 반환 시 §9에 의해 면책 — **'지체 없이'** 는 관행상 48시간 이내 해석.",
  ],
  culture: [
    "근기법 §76의2 — '업무상 적정범위를 넘어' 가 핵심 요건. 주말 심부름은 **명백한 범위 초과**.",
    "공개석상 모욕은 **형법상 모욕죄** 와 경합 — 민형사 + 징계 3중 책임.",
    "정당한 평가는 괴롭힘 구성 안 함. 다만 '표적성·차별성' 입증시 달라짐.",
    "회식 강요 + 불이익 암시는 **협박죄 + 갑질** 경합 가능.",
    "가해자 소속 변경·직무 재배치는 **사용자 의무** (근기법 §76의3).",
  ],
  innovation: [
    "감사원법 §23의2 — 고의/중과실 없는 공익 목적 집행은 **면책**. 사전컨설팅이 최강 증빙.",
    "규제 샌드박스 — 공공기관 주도 가능 (**산업융합촉진법 §10의3**). 최대 4년 유예.",
    "네거티브 규제 전환 — 행정규제기본법 §5의2 — **안전·환경·건강 외 분야는 원칙 허용**.",
    "적극행정 면책은 **결과가 미흡해도** 의도·절차가 공익이면 징계 안 함.",
    "결재 시 **'적극행정 적용 의사'** 를 명시 기재해야 면책 심사 시 가점.",
  ],
};

export default function DialogueRoom() {
  const [idx, setIdx] = useState(0);
  const [running, setRunning] = useState(true);
  const [participants, setParticipants] = useState(64);
  const [options, setOptions] = useState<PollOption[]>(
    CATEGORIES[0].options.map((o) => ({ ...o, votes: 0 }))
  );
  const [sentiment, setSentiment] = useState(SENTIMENT_SEED);
  const [analyses, setAnalyses] = useState<
    { id: string; text: string; ts: string; tone: "law" | "case" | "tip" }[]
  >([]);

  const category = CATEGORIES[idx];

  // Realtime votes
  useEffect(() => {
    if (!running) return;
    const itv = setInterval(() => {
      setOptions((prev) =>
        prev.map((o) => ({
          ...o,
          votes: o.votes + Math.floor(Math.random() * 3),
        }))
      );
      setParticipants((p) =>
        Math.min(p + (Math.random() > 0.6 ? 1 : 0), 320)
      );
    }, 900);
    return () => clearInterval(itv);
  }, [running]);

  // Sentiment drift
  useEffect(() => {
    if (!running) return;
    const itv = setInterval(() => {
      setSentiment((prev) => {
        const last = prev[prev.length - 1];
        const drift = Math.floor(Math.random() * 5) - 2;
        const next = {
          t: `${Number(last.t.replace("m", "")) + 2}m`,
          positive: clamp(last.positive + drift, 30, 85),
          neutral: clamp(last.neutral - Math.sign(drift), 10, 45),
          negative: clamp(last.negative - drift, 3, 30),
        };
        return [...prev.slice(-7), next];
      });
    }, 2400);
    return () => clearInterval(itv);
  }, [running]);

  // Gemini analysis stream
  const poolIdxRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    const emit = () => {
      const pool = ANALYSIS_POOL[category.key];
      const i = poolIdxRef.current % pool.length;
      poolIdxRef.current = i + 1;
      const txt = pool[i];
      const tone: "law" | "case" | "tip" = txt.startsWith("대법") || txt.includes("판례")
        ? "case"
        : txt.includes("§") || txt.includes("법")
          ? "law"
          : "tip";
      const ts = new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      setAnalyses((prev) =>
        [{ id: `${Date.now()}-${i}`, text: txt, ts, tone }, ...prev].slice(0, 6)
      );
    };
    emit();
    const itv = setInterval(emit, 4200);
    return () => clearInterval(itv);
  }, [running, category.key]);

  const total = useMemo(
    () => options.reduce((a, b) => a + b.votes, 0),
    [options]
  );

  const changeCategory = (i: number) => {
    setIdx(i);
    setOptions(CATEGORIES[i].options.map((o) => ({ ...o, votes: 0 })));
    setSentiment(SENTIMENT_SEED);
    setAnalyses([]);
    poolIdxRef.current = 0;
  };

  return (
    <div className="space-y-6">
      {/* SESSION HEADER */}
      <section className="glass-strong gradient-border rounded-3xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11.5px] font-black uppercase tracking-[0.22em]">
              <span className="accent-text">
                Live Session · v2-core Dialogue
              </span>
            </p>
            <h2 className="mt-2 text-2xl font-black text-white md:text-[30px]">
              2026년 <span className="gradient-text">Ethics-Core AI</span>{" "}
              워크숍
            </h2>
            <p className="mt-1 text-[13.5px] font-semibold text-white/80">
              OO공공기관 · 강사 주양순 · Room #EC-204
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-sky-300/25 bg-navy-900/60 px-3 py-2">
              <Users className="h-4 w-4 text-sky-300" />
              <span className="text-sm font-black text-white">
                {participants}
              </span>
              <span className="text-[11px] text-steel-300">참여자</span>
            </div>
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="flex items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-500/10 px-3 py-2 text-[12px] font-black text-sky-100 hover:bg-sky-500/20"
            >
              {running ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> 일시 중지
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> 재개
                </>
              )}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-[12px] font-bold text-white/85 hover:border-sky-300/40"
            >
              <QrCode className="h-3.5 w-3.5" />
              QR 띄우기
            </button>
          </div>
        </div>

        {/* 4대 카테고리 탭 */}
        <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((c, i) => {
            const active = i === idx;
            const Icon = c.Icon;
            return (
              <button
                key={c.key}
                onClick={() => changeCategory(i)}
                className={`group relative overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  active
                    ? "border-white/15 bg-navy-900/80 shadow-[0_12px_40px_-14px_rgba(125,211,252,0.55)]"
                    : "border-white/10 bg-navy-900/50 hover:border-sky-300/30"
                }`}
              >
                <span
                  className={`absolute inset-x-0 top-0 h-1 transition-opacity ${
                    active ? "opacity-100" : "opacity-40"
                  }`}
                  style={{
                    background: `linear-gradient(90deg, ${c.gradient[0]}, ${c.gradient[1]})`,
                  }}
                />
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-black uppercase tracking-widest ${c.chipClass}`}
                  >
                    <Icon className="h-3 w-3" />
                    {c.key === "conflict"
                      ? "Q1"
                      : c.key === "antigraft"
                        ? "Q2"
                        : c.key === "culture"
                          ? "Q3"
                          : "Q4"}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] font-black text-white">
                  {c.title.replace(/^Q\d\s·\s/, "")}
                </p>
                <p className="mt-0.5 text-[11.5px] font-semibold text-white/70">
                  {c.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* POLL + RIGHT PANEL (Sentiment + Gemini Stream) */}
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* ── 투표 차트 ── */}
        <div className="glass gradient-border rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11.5px] font-black uppercase tracking-widest">
                <span className="accent-text">실시간 투표 · {category.title}</span>
              </p>
              <h3 className="mt-1 text-[19px] font-black leading-snug text-white md:text-xl">
                {category.pollQuestion}
              </h3>
            </div>
            <p className="shrink-0 text-[12.5px] font-black text-white/85">
              총 <span className="accent-text">{total}</span>표
            </p>
          </div>

          <div className="mt-5 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={options} layout="vertical" margin={{ left: 30 }}>
                <defs>
                  {/* 카테고리별 그라데이션 정의 */}
                  {CATEGORIES.map((c) => (
                    <linearGradient
                      key={c.gradientId}
                      id={c.gradientId}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor={c.gradient[0]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={c.gradient[1]} stopOpacity={0.95} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid
                  stroke="rgba(255,255,255,0.05)"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  stroke="#8192bf"
                  fontSize={12}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke="#dce7ff"
                  fontSize={12}
                  axisLine={false}
                  tickLine={false}
                  width={180}
                />
                <Tooltip
                  cursor={{ fill: "rgba(125,211,252,0.08)" }}
                  contentStyle={{
                    background: "rgba(7,12,27,0.95)",
                    border: "1px solid rgba(125,211,252,0.4)",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="votes" radius={[0, 8, 8, 0]}>
                  {options.map((o, i) => (
                    <Cell key={o.id + i} fill={`url(#${category.gradientId})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {options.map((o) => {
              const pct =
                total === 0 ? 0 : Math.round((o.votes / total) * 100);
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2.5"
                >
                  <span className="text-[13.5px] font-semibold text-white">
                    {o.label}
                  </span>
                  <span className="text-[12px] font-black">
                    <span className="accent-text">
                      {o.votes}표 · {pct}%
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── 우측: 감정 타임라인 + Gemini 실시간 분석 스트림 ── */}
        <div className="space-y-4">
          <div className="glass gradient-border rounded-2xl p-5">
            <p className="text-[13.5px] font-black text-white">
              실시간 감정 분석 타임라인
            </p>
            <p className="text-[11.5px] font-semibold text-steel-300">
              수강생 채팅·리액션 AI 분석 · 최근 16분
            </p>
            <div className="mt-4 h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sentiment}>
                  <CartesianGrid
                    stroke="rgba(255,255,255,0.05)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="t"
                    stroke="#8192bf"
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#8192bf"
                    fontSize={10}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(7,12,27,0.92)",
                      border: "1px solid rgba(125,211,252,0.4)",
                      borderRadius: 12,
                      color: "#fff",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="positive"
                    stroke="#3ddc97"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="neutral"
                    stroke="#7dd3fc"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="negative"
                    stroke="#f472b6"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex justify-between text-[11.5px]">
              <SentimentPill
                icon={Smile}
                color="#3ddc97"
                label="긍정"
                value={sentiment.at(-1)?.positive ?? 0}
              />
              <SentimentPill
                icon={Meh}
                color="#7dd3fc"
                label="중립"
                value={sentiment.at(-1)?.neutral ?? 0}
              />
              <SentimentPill
                icon={Frown}
                color="#f472b6"
                label="부정"
                value={sentiment.at(-1)?.negative ?? 0}
              />
            </div>
          </div>

          {/* Gemini 실시간 분석 스트림 */}
          <div className="gradient-border glass relative overflow-hidden rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-300" />
              <p className="text-[13.5px] font-black text-white">
                Gemini 실시간 분석 데이터
              </p>
              <span className="ml-auto flex items-center gap-1 rounded-full border border-sky-300/40 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-black text-sky-200">
                <span className="relative h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-sky-300/80" />
                  <span className="absolute inset-0 rounded-full bg-sky-300" />
                </span>
                LIVE
              </span>
            </div>
            <p className="mt-1 text-[11.5px] font-semibold text-steel-300">
              투표 진행 중 — 강사님, 즉시 코멘트에 활용하세요.
            </p>

            <ul className="mt-3 space-y-2">
              {analyses.length === 0 && (
                <li className="rounded-xl border border-white/10 bg-navy-900/60 p-3 text-[12.5px] text-steel-300">
                  분석 대기 중…
                </li>
              )}
              {analyses.map((a, i) => (
                <li
                  key={a.id}
                  className="gemini-stream-row rounded-xl border border-white/10 bg-navy-900/70 p-3"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <ToneChip tone={a.tone} />
                    <span className="ml-auto text-[10.5px] font-black text-steel-300">
                      {a.ts}
                    </span>
                  </div>
                  <p
                    className="mt-1.5 text-[13px] font-semibold leading-relaxed text-white"
                    dangerouslySetInnerHTML={{
                      __html: a.text.replace(
                        /\*\*([^*]+)\*\*/g,
                        '<span class="accent-chip">$1</span>'
                      ),
                    }}
                  />
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-2 rounded-xl border border-sky-300/25 bg-navy-900/60 px-3 py-2">
              <Sparkles className="h-3.5 w-3.5 text-sky-300" />
              <input
                placeholder="수강생에게 보낼 후속 질문"
                className="flex-1 bg-transparent text-[13px] font-semibold text-white placeholder:text-steel-500 outline-none"
              />
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-3 py-1.5 text-[12px] font-black text-white sky-glow"
              >
                <Send className="h-3 w-3" />
                송출
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToneChip({ tone }: { tone: "law" | "case" | "tip" }) {
  const meta =
    tone === "law"
      ? {
          label: "법령 조문",
          cls: "border-sky-300/40 bg-sky-500/15 text-sky-100",
        }
      : tone === "case"
        ? {
            label: "판례·사례",
            cls: "border-violet-300/40 bg-violet-500/15 text-violet-100",
          }
        : {
            label: "실무 팁",
            cls: "border-emerald-300/40 bg-emerald-500/15 text-emerald-100",
          };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-black uppercase tracking-widest ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function SentimentPill({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: number;
}) {
  return (
    <span
      className="flex items-center gap-1 rounded-full border border-white/10 bg-navy-900/60 px-2.5 py-1 font-black"
      style={{ color }}
    >
      <Icon className="h-3 w-3" />
      {label} {value}%
    </span>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
