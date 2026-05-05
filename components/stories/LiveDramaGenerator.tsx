"use client";

/**
 *  components/stories/LiveDramaGenerator.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   [실시간 드라마 분석기]
 *   사용자가 키워드 한 줄을 넣으면 /api/drama/live 를 호출해
 *   Gemini Pro 가 즉석에서 3막 드라마 + Dilemma Quiz 를 생성.
 *   결과는 인포그래픽 + 드라마틱 연출로 렌더.
 */

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  Wand2,
  Scale,
  Film,
  AlertTriangle,
  Trophy,
  RefreshCw,
} from "lucide-react";

/* ── 서버 응답 타입 (dramatizeCase Output 과 동일) ────────────── */
type QuizOption = {
  id: string;
  label: string;
  alignment: number;
  commentary: string;
};
type LawRef = { statute: string; clause: string };
type DramaResult = {
  slug: string;
  title: string;
  hook: string;
  category: string;
  heroEmoji: string;
  stageStart: string;
  stageConflict: string;
  stageFall: string;
  outcome: string;
  lawRefs: LawRef[];
  quizQuestion: string;
  quizOptions: QuizOption[];
  quizCorrectOptionId: string;
  disciplineStats: Array<{ type: string; count: number }>;
  authorNote?: string;
  engine: "gemini" | "fallback";
};

type ApiResp =
  | {
      ok: true;
      data: DramaResult;
      meta: { engine: string; elapsedMs: number; remaining: number };
    }
  | { ok: false; error: string; message?: string };

const SUGGESTIONS = [
  "명절 선물 한우세트",
  "배우자 회사 낙찰",
  "상사의 이중 장부 지시",
  "승진 청탁 봉투",
  "가족 채용 압박",
  "업무 외 주말 심부름",
  "관용차 사적 이용",
  "적극행정 면책",
  "규제 샌드박스 실증",
];

export default function LiveDramaGenerator() {
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DramaResult | null>(null);
  const [meta, setMeta] = useState<{ engine: string; elapsedMs: number } | null>(
    null
  );

  const submit = async (kw?: string) => {
    const q = (kw ?? keyword).trim();
    if (q.length < 2) {
      setError("키워드를 2자 이상 입력해 주세요.");
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch("/api/drama/live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q }),
      });
      const rawText = await r.text();
      let j: ApiResp;
      try {
        j = JSON.parse(rawText) as ApiResp;
      } catch {
        const head = rawText.replace(/\s+/g, " ").slice(0, 160);
        setError(
          r.ok
            ? `서버 응답이 JSON이 아닙니다. (CDN/게이트웨이 HTML 응답 가능) ${head}`
            : `HTTP ${r.status}. ${head}`
        );
        return;
      }
      if (!j.ok) {
        setError(j.message ?? j.error ?? "생성에 실패했습니다.");
        return;
      }
      setResult(j.data);
      setMeta({ engine: j.meta.engine, elapsedMs: j.meta.elapsedMs });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-5 md:p-7">
      <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />

      <div className="relative">
        <div className="mb-3 flex items-center gap-2">
          <Film className="h-4 w-4 text-sky-300" />
          <p className="text-[11px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">
              Live Drama Analyzer · 실시간 드라마 분석기
            </span>
          </p>
          <span className="ml-auto rounded-full border border-sky-300/40 bg-sky-500/10 px-2 py-0.5 text-[10.5px] font-black text-sky-200">
            Gemini Pro
          </span>
        </div>

        <h3 className="text-2xl font-black leading-snug text-white md:text-[28px]">
          키워드 <span className="gradient-text">한 줄</span>만 넣으세요 — 3막
          드라마가 즉석에서 펼쳐집니다
        </h3>
        <p className="mt-3 text-[14.5px] font-semibold leading-relaxed text-white/85 md:text-[15px]">
          예: <span className="accent-chip">명절 선물</span>{" "}
          <span className="accent-chip">가족 채용</span>{" "}
          <span className="accent-chip">부당지시</span>{" "}
          <span className="accent-chip">적극행정 면책</span> — 법령 근거 +
          Dilemma Quiz + 예상 징계 수위까지 한 번에.
        </p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !loading) submit();
            }}
            placeholder="예: 명절 선물 한우세트"
            className="flex-1 rounded-xl border border-sky-300/25 bg-navy-900/60 px-4 py-3.5 text-[15px] font-bold text-white placeholder-steel-400 focus:border-sky-300/60 focus:outline-none focus:ring-2 focus:ring-sky-400/30"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => submit()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-5 py-3 text-[14px] font-black text-white sky-glow disabled:opacity-60"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                생성 중…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" />
                3막 드라마 생성
              </>
            )}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setKeyword(s);
                submit(s);
              }}
              disabled={loading}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12.5px] font-bold text-steel-200 hover:border-sky-300/50 hover:bg-sky-500/10 hover:text-sky-100"
            >
              # {s}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] font-bold text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-white/5 bg-navy-900/40"
                style={{
                  animation: `echo-chest 1.6s ease-in-out infinite`,
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}

        {result && !loading && <DramaResultView data={result} meta={meta} onRetry={() => submit()} />}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  결과 렌더 — 3막 + 퀴즈 + 예상 징계 게이지 + 법령
 * ═══════════════════════════════════════════════════════════════════ */

function DramaResultView({
  data,
  meta,
  onRetry,
}: {
  data: DramaResult;
  meta: { engine: string; elapsedMs: number } | null;
  onRetry: () => void;
}) {
  const rawStats = Array.isArray(data?.disciplineStats)
    ? data.disciplineStats
    : [];
  const stats = [...rawStats].sort((a, b) => b.count - a.count);
  const total = stats.reduce((s, x) => s + x.count, 0) || 1;
  const top = stats[0] ?? { type: "데이터 준비중", count: 0 };
  const lawRefs = Array.isArray(data?.lawRefs) ? data.lawRefs : [];
  const quizOptions = Array.isArray(data?.quizOptions) ? data.quizOptions : [];
  const engineChip =
    data.engine === "gemini"
      ? { lbl: "Gemini Pro", cls: "border-sky-300/50 bg-sky-500/10 text-sky-200" }
      : { lbl: "Fallback Engine", cls: "border-white/15 bg-white/5 text-steel-200" };

  return (
    <div className="mt-6 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/30 to-violet-500/25 text-3xl">
            {data.heroEmoji}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-200">
                {data.category}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${engineChip.cls}`}
              >
                {engineChip.lbl}
              </span>
              {meta && (
                <span className="text-[10px] font-bold text-steel-400">
                  · {meta.elapsedMs}ms
                </span>
              )}
            </div>
            <h4 className="mt-1 text-xl font-black leading-snug text-white md:text-2xl">
              {data.title}
            </h4>
            <p className="mt-1 text-[13px] leading-relaxed text-steel-300">
              {data.hook}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold text-steel-200 hover:text-white"
        >
          <RefreshCw className="h-3 w-3" />
          재생성
        </button>
      </header>

      {/* 3막 카드 */}
      <div className="grid gap-3 md:grid-cols-3">
        <StageCard stage={1} title="발단 · 유혹" tone="navy" body={data.stageStart} />
        <StageCard stage={2} title="전개 · 적발" tone="amber" body={data.stageConflict} />
        <StageCard stage={3} title="결말 · 후폭풍" tone="rose" body={data.stageFall} />
      </div>

      {/* 법령 근거 */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Scale className="h-3.5 w-3.5 text-sky-300" />
          <p className="text-[11px] font-black uppercase tracking-widest">
            <span className="accent-text">법령 근거</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {lawRefs.map((l, i) => (
            <span
              key={i}
              className="rounded-lg border border-sky-300/20 bg-navy-900/60 px-2.5 py-1 text-[12px] font-bold text-steel-100"
            >
              <b className="accent-text">{l.statute}</b> · {l.clause}
            </span>
          ))}
        </div>
      </div>

      {/* 판결/결과 */}
      <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-4">
        <p className="text-[11px] font-black uppercase tracking-widest">
          <span className="accent-text">판례·처분 요약</span>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-steel-100">
          {data.outcome}
        </p>
      </div>

      {/* 퀴즈 */}
      <div className="rounded-2xl border border-sky-300/30 bg-gradient-to-br from-navy-900/80 via-indigo-950/35 to-violet-950/35 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-300" />
          <p className="text-[11px] font-black uppercase tracking-widest">
            <span className="accent-text">Dilemma Quiz</span>
          </p>
        </div>
        <p className="text-sm font-bold text-white">{data.quizQuestion}</p>
        <ul className="mt-3 space-y-2">
          {quizOptions.map((o) => {
            const correct = o.id === data.quizCorrectOptionId;
            return (
              <li
                key={o.id}
                className={`rounded-xl border p-3 text-[12.5px] leading-relaxed ${
                  correct
                    ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    : "border-white/10 bg-navy-900/60 text-steel-200"
                }`}
              >
                <p className="flex items-center gap-2 font-black">
                  {correct && <Trophy className="h-3.5 w-3.5 text-emerald-300" />}
                  {o.label}
                  <span className="ml-auto text-[10px] font-bold text-steel-400">
                    정합도 {o.alignment}%
                  </span>
                </p>
                <p className="mt-1 text-[11.5px] text-steel-300">{o.commentary}</p>
              </li>
            );
          })}
        </ul>
      </div>

      {/* 징계 시뮬레이터 게이지 */}
      <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest">
            <span className="accent-text">예상 징계 수위 분포</span>
          </p>
          <span className="text-[12px] font-bold text-steel-200">
            최빈 처분: <b className="text-white">{top.type}</b>
          </span>
        </div>
        {stats.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-navy-900/50 px-3 py-2 text-[12px] text-steel-300">
            처분 통계 데이터가 아직 준비되지 않았습니다. 잠시 후 다시
            시도해주세요.
          </p>
        ) : (
          <div className="space-y-2">
            {stats.map((s) => {
              const pct = Math.round((s.count / total) * 100);
              return (
                <div key={s.type}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-bold text-steel-100">{s.type}</span>
                    <span className="font-bold text-steel-300">
                      {s.count}건 · {pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {data.authorNote && (
        <p className="rounded-2xl border border-white/10 bg-navy-900/40 p-4 text-[12.5px] italic leading-relaxed text-steel-300">
          — {data.authorNote}
        </p>
      )}
    </div>
  );
}

function StageCard({
  stage,
  title,
  tone,
  body,
}: {
  stage: number;
  title: string;
  tone: "navy" | "amber" | "rose";
  body: string;
}) {
  const toneCls =
    tone === "navy"
      ? "border-sky-400/35 from-sky-950/50"
      : tone === "amber"
        ? "border-indigo-400/35 from-indigo-950/45"
        : "border-violet-400/40 from-violet-950/45";
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-b to-navy-900/80 p-4 ${toneCls}`}
    >
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-[11px] font-black text-white">
          {stage}
        </span>
        <p className="text-[11px] font-black uppercase tracking-widest">
          <span className="accent-text">{title}</span>
        </p>
      </div>
      <p className="mt-2 whitespace-pre-line text-[12.5px] leading-relaxed text-steel-100">
        {body}
      </p>
    </div>
  );
}
