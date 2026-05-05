"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  BookOpen,
  Flame,
  Gavel,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import type { StoryDTO } from "@/lib/story";

type Stage = "start" | "conflict" | "quiz" | "fall" | "discipline";

const STAGE_ORDER: Stage[] = [
  "start",
  "conflict",
  "quiz",
  "fall",
  "discipline",
];

const DISCIPLINE_LEVEL: Record<string, number> = {
  견책: 1,
  감봉: 2,
  정직: 3,
  강등: 4,
  해임: 5,
  파면: 6,
};

const DISCIPLINE_COLOR: Record<string, string> = {
  견책: "#7fb4ff",
  감봉: "#5eead4",
  정직: "#ffa24c",
  강등: "#ff7a1a",
  해임: "#ff5a8a",
  파면: "#ff4d6d",
};

export default function StoryDetail({ story }: { story: StoryDTO }) {
  const [stage, setStage] = useState<Stage>("start");
  const [pickedOptionId, setPickedOptionId] = useState<string | null>(null);
  const [showSimulator, setShowSimulator] = useState(false);

  const picked = useMemo(
    () => story.quizOptions.find((o) => o.id === pickedOptionId) ?? null,
    [pickedOptionId, story.quizOptions]
  );

  const correctOption = useMemo(
    () =>
      story.quizOptions.find((o) => o.id === story.quizCorrectOptionId) ?? null,
    [story]
  );

  const sortedStats = useMemo(
    () =>
      [...story.disciplineStats].sort(
        (a, b) => (DISCIPLINE_LEVEL[a.type] ?? 99) - (DISCIPLINE_LEVEL[b.type] ?? 99)
      ),
    [story.disciplineStats]
  );

  const totalCases = sortedStats.reduce((a, b) => a + b.count, 0);

  const goNext = () => {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  };

  return (
    <div className="grid gap-5 md:gap-6 lg:grid-cols-[1.55fr_1fr]">
      {/* LEFT: STORY TRACK */}
      <article className="space-y-5">
        {/* HERO CARD */}
        <header className="glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8">
          <div className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-8 h-60 w-60 rounded-full bg-orange-500/25 blur-3xl" />
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center">
            <div className="grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-orange-500/30 to-rose-500/20 text-5xl">
              {story.heroEmoji}
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-orange-300">
                Ethics-Drama · {story.category}
              </p>
              <h1 className="mt-2 text-3xl font-black leading-snug text-white md:text-[40px]">
                {story.title}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-steel-100 md:text-[18px]">
                {story.hook}
              </p>
            </div>
          </div>
        </header>

        {/* STAGE TIMELINE */}
        <StageTimeline stage={stage} />

        {/* STAGE CONTENT */}
        {stage === "start" && (
          <StageCard
            step={1}
            label="사건의 발단"
            icon={<BookOpen className="h-4 w-4 text-orange-300" />}
            body={story.stageStart}
            nextLabel="다음 — 갈등 속으로"
            onNext={goNext}
          />
        )}
        {stage === "conflict" && (
          <StageCard
            step={2}
            label="갈등 · 선택의 기로"
            icon={<Flame className="h-4 w-4 text-orange-300" />}
            body={story.stageConflict}
            nextLabel="Dilemma Quiz 풀기"
            onNext={goNext}
          />
        )}

        {stage === "quiz" && (
          <div className="glass rounded-3xl p-6 md:p-8">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-400" />
              <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
                Dilemma Quiz · 당신의 선택은?
              </p>
            </div>
            <h3 className="mt-3 text-xl font-black leading-snug text-white md:text-2xl">
              {story.quizQuestion}
            </h3>

            <div className="mt-5 grid gap-2.5">
              {story.quizOptions.map((o) => {
                const active = picked?.id === o.id;
                const isCorrect = o.id === story.quizCorrectOptionId;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setPickedOptionId(o.id)}
                    className={`group flex items-start gap-3 rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? isCorrect
                          ? "border-emerald-400/60 bg-emerald-500/10"
                          : "border-rose-400/50 bg-rose-500/10"
                        : "border-white/10 bg-navy-900/60 hover:border-orange-400/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-black ${
                        active
                          ? isCorrect
                            ? "bg-emerald-500/30 text-emerald-200"
                            : "bg-rose-500/30 text-rose-200"
                          : "bg-white/5 text-steel-300 group-hover:text-orange-300"
                      }`}
                    >
                      {active ? (isCorrect ? "✓" : "!") : "?"}
                    </span>
                    <div className="flex-1">
                      <p className="text-base font-black text-white md:text-[18px]">
                        {o.label}
                      </p>
                      {active && (
                        <div className="mt-3 space-y-3">
                          <div className="flex items-center gap-2 text-[11px] font-bold">
                            <AlignmentBar alignment={o.alignment} />
                          </div>
                          <p className="text-[14px] leading-relaxed text-steel-100 md:text-[15px]">
                            {o.commentary}
                          </p>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {picked && (
              <div
                className={`mt-5 flex flex-col gap-3 rounded-2xl border p-4 text-sm md:flex-row md:items-center md:justify-between ${
                  picked.id === story.quizCorrectOptionId
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-400/40 bg-rose-500/10 text-rose-100"
                }`}
              >
                <div className="flex items-start gap-2">
                  {picked.id === story.quizCorrectOptionId ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-rose-300" />
                  )}
                  <p className="leading-relaxed">
                    실제 판례와의 정합도{" "}
                    <span className="font-black">{picked.alignment}%</span>.{" "}
                    {picked.id === story.quizCorrectOptionId
                      ? "정답 경로입니다. 실제 판례와 동일한 대응입니다."
                      : correctOption
                        ? `가장 정합하는 선택은 "${correctOption.label}" 입니다.`
                        : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={goNext}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-4 py-2 text-[11px] font-black text-white orange-glow"
                >
                  실제 결과 보기
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "fall" && (
          <>
            <StageCard
              step={3}
              label="파멸 · 징계 결과"
              icon={<AlertTriangle className="h-4 w-4 text-rose-300" />}
              body={story.stageFall}
              nextLabel="유사 사례 징계수위 보기"
              onNext={() => {
                setShowSimulator(true);
                goNext();
              }}
              tone="danger"
            />
            <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-xs text-orange-100">
              <span className="font-black">실제 판례 정리:</span> {story.outcome}
            </div>
          </>
        )}

        {stage === "discipline" && (
          <DisciplineSimulator
            stats={sortedStats}
            totalCases={totalCases}
            visible={showSimulator || true}
          />
        )}
      </article>

      {/* RIGHT: SIDEBAR */}
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="glass rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Gavel className="h-4 w-4 text-orange-400" />
            <p className="text-base font-black text-white md:text-lg">근거 법령 · 조항</p>
          </div>
          <ul className="space-y-2">
            {story.lawRefs.map((l, i) => (
              <li
                key={i}
                className="rounded-xl border border-white/5 bg-navy-900/50 px-4 py-3 text-sm"
              >
                <p className="font-black text-white md:text-[16px]">{l.statute}</p>
                <p className="mt-1 text-steel-200 md:text-[15px]">{l.clause}</p>
                {l.url && (
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-black text-orange-300 hover:underline"
                  >
                    원문 보기 →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>

        {story.authorNote && (
          <div className="glass-strong rounded-2xl p-6">
            <p className="text-xs font-black uppercase tracking-widest text-orange-300">
              강사 코멘트
            </p>
            <p className="mt-3 text-base leading-relaxed text-steel-100 md:text-[17px]">
              “{story.authorNote}”
            </p>
          </div>
        )}

        <div className="glass rounded-2xl p-5">
          <p className="text-base font-black text-white">읽기 진행도</p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-navy-500 to-orange-400 transition-all"
              style={{
                width: `${
                  ((STAGE_ORDER.indexOf(stage) + 1) / STAGE_ORDER.length) * 100
                }%`,
              }}
            />
          </div>
          <div className="mt-3 flex justify-between text-xs font-bold text-steel-300 md:text-[13px]">
            <span>발단</span>
            <span>갈등</span>
            <span>퀴즈</span>
            <span>파멸</span>
            <span>시뮬</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── sub components ─────────────────────────────────────────────── */

function StageTimeline({ stage }: { stage: Stage }) {
  const steps: { id: Stage; label: string }[] = [
    { id: "start", label: "발단" },
    { id: "conflict", label: "갈등" },
    { id: "quiz", label: "Quiz" },
    { id: "fall", label: "파멸" },
    { id: "discipline", label: "시뮬" },
  ];
  const idx = steps.findIndex((s) => s.id === stage);
  return (
    <ol className="grid grid-cols-5 gap-2 md:gap-3">
      {steps.map((s, i) => {
        const state = i < idx ? "done" : i === idx ? "active" : "todo";
        return (
          <li
            key={s.id}
            className={`rounded-xl border px-2 py-2.5 text-center text-xs font-black transition-all md:px-3 md:py-3 md:text-[13px] ${
              state === "active"
                ? "border-orange-400/60 bg-orange-500/10 text-white"
                : state === "done"
                  ? "border-emerald-400/30 bg-emerald-500/5 text-emerald-200"
                  : "border-white/10 bg-navy-900/60 text-steel-400"
            }`}
          >
            {i + 1}. {s.label}
          </li>
        );
      })}
    </ol>
  );
}

function StageCard({
  step,
  label,
  icon,
  body,
  onNext,
  nextLabel,
  tone = "default",
}: {
  step: number;
  label: string;
  icon: React.ReactNode;
  body: string;
  onNext?: () => void;
  nextLabel?: string;
  tone?: "default" | "danger";
}) {
  const border =
    tone === "danger" ? "border-rose-400/30" : "border-white/10";
  return (
    <div className={`glass rounded-3xl border ${border} p-5 md:p-7`}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
          Stage {step} · {label}
        </p>
      </div>
      <p className="mt-3 whitespace-pre-line text-[17px] leading-relaxed text-steel-100 md:text-[19px]">
        {body}
      </p>
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          className="mt-6 inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-4 py-3 text-sm font-black text-white orange-glow"
        >
          {nextLabel}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function AlignmentBar({ alignment }: { alignment: number }) {
  const color =
    alignment >= 80
      ? "bg-emerald-400"
      : alignment >= 50
        ? "bg-orange-400"
        : "bg-rose-400";
  return (
    <div className="flex w-full items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${alignment}%` }}
        />
      </div>
      <span className="min-w-[44px] text-right font-black text-steel-200">
        {alignment}%
      </span>
    </div>
  );
}

function DisciplineSimulator({
  stats,
  totalCases,
  visible,
}: {
  stats: { type: string; count: number }[];
  totalCases: number;
  visible: boolean;
}) {
  if (!visible) return null;

  const data = stats.map((s) => ({
    ...s,
    pct: totalCases === 0 ? 0 : Math.round((s.count / totalCases) * 100),
  }));

  const peak = [...data].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="glass-strong rounded-3xl p-5 md:p-7">
      <div className="flex items-center gap-2">
        <Gavel className="h-4 w-4 text-orange-400" />
        <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
          Discipline Simulator · 유사 사례 징계수위
        </p>
      </div>
      <h3 className="mt-2 text-lg font-black text-white md:text-xl">
        과거 유사 판례 {totalCases}건의 징계 분포
      </h3>
      <p className="mt-1 text-[12px] text-steel-300">
        가장 많이 내려진 징계는{" "}
        <span className="font-black text-orange-200">
          {peak?.type ?? "-"} ({peak?.count ?? 0}건)
        </span>{" "}
        입니다. 징계는 상황·재발·신고여부에 따라 가중됩니다.
      </p>

      <div className="mt-5 h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="type"
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
              formatter={(value, _name, item) => {
                const pct = (item?.payload as { pct?: number } | undefined)?.pct ?? 0;
                return [`${value}건 (${pct}%)`, "건수"];
              }}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={DISCIPLINE_COLOR[d.type] ?? "#ffa24c"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {data.map((d) => (
          <div
            key={d.type}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: DISCIPLINE_COLOR[d.type] ?? "#ffa24c" }}
              />
              <span className="text-sm font-bold text-white">{d.type}</span>
            </div>
            <span className="text-[11px] font-black text-steel-200">
              {d.count}건 · {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
