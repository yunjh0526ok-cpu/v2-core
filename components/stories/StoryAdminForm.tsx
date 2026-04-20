"use client";

import { useState } from "react";
import {
  Plus,
  Trash2,
  BookOpen,
  Gavel,
  Save,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Wand2,
  Loader2,
} from "lucide-react";

type LawRef = { statute: string; clause: string; url?: string };
type QuizOption = {
  id: string;
  label: string;
  alignment: number;
  commentary: string;
};
type DisciplineStat = { type: string; count: number };

type FormState = {
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
  disciplineStats: DisciplineStat[];
  authorNote: string;
  published: boolean;
};

const CATEGORY_OPTIONS = [
  "청탁",
  "이해충돌",
  "갑질",
  "예산·계약",
  "인사·채용",
  "정보보안",
];

const DISCIPLINE_TYPES = [
  "견책",
  "감봉",
  "정직",
  "강등",
  "해임",
  "파면",
];

const EMOJI_OPTIONS = ["⚖️", "☕", "🏛️", "📱", "💼", "🕴️", "🚨", "🎭"];

const INITIAL: FormState = {
  slug: "",
  title: "",
  hook: "",
  category: "청탁",
  heroEmoji: "⚖️",
  stageStart: "",
  stageConflict: "",
  stageFall: "",
  outcome: "",
  lawRefs: [{ statute: "", clause: "" }],
  quizQuestion: "",
  quizOptions: [
    { id: "opt-1", label: "", alignment: 0, commentary: "" },
    { id: "opt-2", label: "", alignment: 100, commentary: "" },
  ],
  quizCorrectOptionId: "opt-2",
  disciplineStats: DISCIPLINE_TYPES.map((t) => ({ type: t, count: 0 })),
  authorNote: "",
  published: true,
};

export default function StoryAdminForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saving" }
    | { kind: "ok"; id: string; slug: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  /* ── AI 각색 (Fact → Drama) ────────────────────────────────── */
  const [facts, setFacts] = useState("");
  const [realOutcome, setRealOutcome] = useState("");
  const [dramatizing, setDramatizing] = useState(false);
  const [dramatizeInfo, setDramatizeInfo] = useState<
    | { kind: "idle" }
    | { kind: "ok"; engine: string; elapsedMs: number }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const runDramatize = async () => {
    if (facts.trim().length < 20) {
      setDramatizeInfo({
        kind: "error",
        message: "사실 관계는 최소 20자 이상 입력해 주세요.",
      });
      return;
    }
    setDramatizing(true);
    setDramatizeInfo({ kind: "idle" });
    try {
      const res = await fetch("/api/stories/ai-dramatize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts,
          category: form.category,
          lawHints: form.lawRefs
            .filter((l) => l.statute.trim())
            .map((l) => ({ statute: l.statute, clause: l.clause })),
          realOutcome: realOutcome || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json?.message ?? json?.error ?? "각색 실패");
      }
      const d = json.data;

      // Gemini 가 만들어 온 quizOptions 에 id 부여 (기존 UI 와 호환)
      const options = (d.quizOptions ?? []).map(
        (o: {
          label: string;
          alignment: number;
          commentary: string;
          isCorrect: boolean;
        }, i: number) => ({
          id: `opt-${i + 1}`,
          label: o.label,
          alignment: o.alignment,
          commentary: o.commentary,
        })
      );
      const correctIdx = (d.quizOptions ?? []).findIndex(
        (o: { isCorrect: boolean }) => o.isCorrect
      );
      const correctOptionId =
        correctIdx >= 0 ? `opt-${correctIdx + 1}` : options[0]?.id ?? "opt-1";

      setForm((prev) => ({
        ...prev,
        slug: d.slug || prev.slug,
        title: d.title || prev.title,
        hook: d.hook || prev.hook,
        heroEmoji: d.heroEmoji || prev.heroEmoji,
        stageStart: d.stageStart || prev.stageStart,
        stageConflict: d.stageConflict || prev.stageConflict,
        stageFall: d.stageFall || prev.stageFall,
        outcome: d.outcome || prev.outcome,
        quizQuestion: d.quizQuestion || prev.quizQuestion,
        quizOptions: options.length >= 2 ? options : prev.quizOptions,
        quizCorrectOptionId: correctOptionId,
        authorNote: d.authorNote || prev.authorNote,
      }));

      setDramatizeInfo({
        kind: "ok",
        engine: json.meta?.engine ?? d.engine ?? "gemini",
        elapsedMs: json.meta?.elapsedMs ?? 0,
      });
    } catch (e) {
      setDramatizeInfo({
        kind: "error",
        message: e instanceof Error ? e.message : "네트워크 오류",
      });
    } finally {
      setDramatizing(false);
    }
  };

  const up = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const setLawRef = (i: number, patch: Partial<LawRef>) =>
    setForm((p) => ({
      ...p,
      lawRefs: p.lawRefs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const addLawRef = () =>
    setForm((p) => ({
      ...p,
      lawRefs: [...p.lawRefs, { statute: "", clause: "" }],
    }));
  const removeLawRef = (i: number) =>
    setForm((p) => ({
      ...p,
      lawRefs: p.lawRefs.filter((_, idx) => idx !== i),
    }));

  const setOption = (i: number, patch: Partial<QuizOption>) =>
    setForm((p) => ({
      ...p,
      quizOptions: p.quizOptions.map((o, idx) =>
        idx === i ? { ...o, ...patch } : o
      ),
    }));
  const addOption = () =>
    setForm((p) => {
      const nextId = `opt-${p.quizOptions.length + 1}`;
      return {
        ...p,
        quizOptions: [
          ...p.quizOptions,
          { id: nextId, label: "", alignment: 50, commentary: "" },
        ],
      };
    });
  const removeOption = (i: number) =>
    setForm((p) => ({
      ...p,
      quizOptions: p.quizOptions.filter((_, idx) => idx !== i),
    }));

  const setDiscipline = (i: number, count: number) =>
    setForm((p) => ({
      ...p,
      disciplineStats: p.disciplineStats.map((d, idx) =>
        idx === i ? { ...d, count } : d
      ),
    }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg =
          json?.details?.[0]?.message ??
          json?.error ??
          `저장 실패 (HTTP ${res.status})`;
        setStatus({ kind: "error", message: String(msg) });
        return;
      }
      setStatus({ kind: "ok", id: json.data.id, slug: json.data.slug });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.",
      });
    }
  };

  return (
    <form
      onSubmit={submit}
      className="grid gap-5 lg:grid-cols-[1.5fr_1fr] lg:gap-6"
    >
      {/* LEFT: INPUTS */}
      <div className="space-y-5">
        {/* AI 각색 (Gemini Pro) */}
        <section className="glass-strong rounded-3xl border border-orange-400/30 p-5">
          <div className="mb-1 flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-orange-300" />
            <h3 className="text-sm font-black text-white">
              AI 각색 · Fact → Drama
            </h3>
            <span className="ml-auto rounded-full border border-orange-400/40 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black text-orange-200">
              Gemini Pro
            </span>
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-steel-300">
            강사님의 20년 원천 판례 사실을 입력하시면, 에코가 숏폼 드라마 3막
            구조 + Dilemma Quiz 로 자동 각색합니다. 실명·기관명은 자동으로
            익명화되며, 법령은 입력하신 힌트 범위 내에서만 인용됩니다.
          </p>
          <TextArea
            label="원천 판례 사실 (Facts)"
            value={facts}
            onChange={setFacts}
            placeholder={
              "예) 평가담당 공무원이 계약 업체 대표로부터 명절 한우세트(50만원 상당)를 자택에서 수수. 3개월 뒤 해당 업체가 같은 평가자의 결재 라인에 올라옴. 감사 과정에서 CCTV·택배 기록으로 수수 사실이 확인됨…"
            }
            rows={6}
          />
          <TextArea
            label="실제 판례의 징계/결과 (선택)"
            value={realOutcome}
            onChange={setRealOutcome}
            placeholder="예) 청탁금지법 제8조 위반, 정직 3개월. 징계부가금 2배 부과."
            rows={2}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={runDramatize}
              disabled={dramatizing}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-4 py-2.5 text-xs font-black text-white orange-glow disabled:opacity-60"
            >
              {dramatizing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  에코가 각색 중…
                </>
              ) : (
                <>
                  <Wand2 className="h-3.5 w-3.5" />
                  AI 로 자동 각색
                </>
              )}
            </button>
            {dramatizeInfo.kind === "ok" && (
              <span className="text-[11px] font-bold text-emerald-300">
                ✓ {dramatizeInfo.engine} · {dramatizeInfo.elapsedMs}ms 완료.
                아래 필드가 채워졌습니다.
              </span>
            )}
            {dramatizeInfo.kind === "error" && (
              <span className="text-[11px] font-bold text-rose-300">
                ✗ {dramatizeInfo.message}
              </span>
            )}
          </div>
        </section>

        {/* BASIC */}
        <Section
          icon={<BookOpen className="h-4 w-4 text-orange-300" />}
          title="기본 정보"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Slug (URL)"
              value={form.slug}
              onChange={(v) => up("slug", v.toLowerCase().replace(/\s+/g, "-"))}
              placeholder="coffee-3-month-suspension"
              required
            />
            <SelectField
              label="카테고리"
              value={form.category}
              options={CATEGORY_OPTIONS}
              onChange={(v) => up("category", v)}
            />
            <TextField
              label="제목 (호기심 자극)"
              value={form.title}
              onChange={(v) => up("title", v)}
              placeholder="예: 커피 한 잔이 정직 3개월이 된 사연"
              required
              full
            />
            <TextField
              label="훅 카피"
              value={form.hook}
              onChange={(v) => up("hook", v)}
              placeholder="한 문장 요약 훅"
              required
              full
            />
          </div>

          <div className="mt-3">
            <Label>히어로 이모지</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => up("heroEmoji", e)}
                  className={`grid h-10 w-10 place-items-center rounded-xl border text-xl ${
                    form.heroEmoji === e
                      ? "border-orange-400/60 bg-orange-500/10"
                      : "border-white/10 bg-navy-900/60 hover:border-white/20"
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* STAGES */}
        <Section
          icon={<Sparkles className="h-4 w-4 text-orange-300" />}
          title="3단 스토리"
        >
          <TextArea
            label="발단 (Stage 1)"
            value={form.stageStart}
            onChange={(v) => up("stageStart", v)}
            placeholder="사건이 시작된 장면을 서술해 주세요."
            rows={3}
          />
          <TextArea
            label="갈등 (Stage 2)"
            value={form.stageConflict}
            onChange={(v) => up("stageConflict", v)}
            placeholder="선택의 기로·심리적 압박·반복적 제안 등을 묘사해 주세요."
            rows={3}
          />
          <TextArea
            label="파멸 (Stage 3)"
            value={form.stageFall}
            onChange={(v) => up("stageFall", v)}
            placeholder="실제 징계 결과와 파장을 작성해 주세요."
            rows={3}
          />
          <TextArea
            label="실제 판례 결과 요약"
            value={form.outcome}
            onChange={(v) => up("outcome", v)}
            placeholder="법적 판단의 핵심(직무관련성, 반복성 등)을 한 단락으로."
            rows={2}
          />
        </Section>

        {/* LAW REFS */}
        <Section
          icon={<Gavel className="h-4 w-4 text-orange-300" />}
          title="근거 법령 · 조항"
        >
          <div className="space-y-2">
            {form.lawRefs.map((l, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border border-white/10 bg-navy-900/60 p-3 md:grid-cols-[1fr_1.4fr_auto]"
              >
                <input
                  value={l.statute}
                  onChange={(e) => setLawRef(i, { statute: e.target.value })}
                  placeholder="예: 청탁금지법"
                  className="rounded-lg border border-white/10 bg-navy-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-orange-400/50"
                />
                <input
                  value={l.clause}
                  onChange={(e) => setLawRef(i, { clause: e.target.value })}
                  placeholder="예: 제8조(금품등 수수 금지)"
                  className="rounded-lg border border-white/10 bg-navy-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-orange-400/50"
                />
                <button
                  type="button"
                  onClick={() => removeLawRef(i)}
                  className="self-center rounded-lg border border-white/10 px-2 py-1.5 text-steel-300 hover:text-rose-300"
                  aria-label="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addLawRef}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-xs font-bold text-steel-200 hover:border-orange-400/40"
            >
              <Plus className="h-3 w-3" />
              법령 추가
            </button>
          </div>
        </Section>

        {/* QUIZ */}
        <Section
          icon={<Sparkles className="h-4 w-4 text-orange-300" />}
          title="Dilemma Quiz"
        >
          <TextField
            label="질문"
            value={form.quizQuestion}
            onChange={(v) => up("quizQuestion", v)}
            placeholder="예: 직무관련자가 커피를 건넵니다. 당신의 선택은?"
            full
          />

          <div className="mt-3 space-y-3">
            {form.quizOptions.map((o, i) => (
              <div
                key={o.id}
                className={`rounded-2xl border p-3 ${
                  o.id === form.quizCorrectOptionId
                    ? "border-emerald-400/40 bg-emerald-500/10"
                    : "border-white/10 bg-navy-900/60"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-orange-300">
                    옵션 {i + 1} · id=
                    <span className="text-steel-300">{o.id}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-[11px] font-bold text-steel-300">
                      <input
                        type="radio"
                        name="correct"
                        checked={o.id === form.quizCorrectOptionId}
                        onChange={() => up("quizCorrectOptionId", o.id)}
                      />
                      정답
                    </label>
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-steel-300 hover:text-rose-300"
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <input
                  value={o.label}
                  onChange={(e) => setOption(i, { label: e.target.value })}
                  placeholder="선택지 문구"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-navy-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-orange-400/50"
                />
                <div className="mt-2 grid gap-2 md:grid-cols-[1fr_2fr]">
                  <div>
                    <Label>판례 정합도 (0-100)</Label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={o.alignment}
                      onChange={(e) =>
                        setOption(i, {
                          alignment: Math.max(
                            0,
                            Math.min(100, Number(e.target.value))
                          ),
                        })
                      }
                      className="w-full rounded-lg border border-white/10 bg-navy-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-orange-400/50"
                    />
                  </div>
                  <div>
                    <Label>해설</Label>
                    <input
                      value={o.commentary}
                      onChange={(e) =>
                        setOption(i, { commentary: e.target.value })
                      }
                      placeholder="왜 이 선택이 위반/정답인지 간결히"
                      className="w-full rounded-lg border border-white/10 bg-navy-950/60 px-2.5 py-2 text-sm text-white outline-none focus:border-orange-400/50"
                    />
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-xs font-bold text-steel-200 hover:border-orange-400/40"
            >
              <Plus className="h-3 w-3" />
              선택지 추가
            </button>
          </div>
        </Section>

        {/* DISCIPLINE */}
        <Section
          icon={<Gavel className="h-4 w-4 text-orange-300" />}
          title="유사 사례 징계수위 분포"
        >
          <p className="mb-2 text-[11px] text-steel-400">
            과거 유사 판례에서 각 징계 유형이 몇 번씩 내려졌는지 입력 —
            시뮬레이터 차트의 데이터 소스입니다.
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {form.disciplineStats.map((d, i) => (
              <label
                key={d.type}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2"
              >
                <span className="text-sm font-bold text-white">{d.type}</span>
                <input
                  type="number"
                  min={0}
                  value={d.count}
                  onChange={(e) =>
                    setDiscipline(i, Math.max(0, Number(e.target.value)))
                  }
                  className="w-20 rounded-lg border border-white/10 bg-navy-950/60 px-2 py-1 text-right text-sm text-white outline-none focus:border-orange-400/50"
                />
              </label>
            ))}
          </div>
        </Section>

        {/* AUTHOR NOTE */}
        <Section
          icon={<Sparkles className="h-4 w-4 text-orange-300" />}
          title="강사 코멘트 (선택)"
        >
          <TextArea
            label=""
            value={form.authorNote}
            onChange={(v) => up("authorNote", v)}
            placeholder="현장에서 본 패턴, 핵심 교훈 등을 자유롭게"
            rows={2}
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-steel-300">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => up("published", e.target.checked)}
            />
            바로 발행 (`/stories` 목록에 노출)
          </label>
        </Section>
      </div>

      {/* RIGHT: PREVIEW + SAVE */}
      <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
        <div className="glass-strong rounded-3xl p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
            Live Preview
          </p>
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-white/10 bg-navy-900/60 p-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-500/30 to-rose-500/20 text-2xl">
              {form.heroEmoji}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black text-orange-300">
                {form.category}
              </p>
              <p className="truncate text-sm font-black text-white">
                {form.title || "(제목 미입력)"}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] text-steel-300">
                {form.hook || "(훅 카피 미입력)"}
              </p>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-steel-400">
            <p>옵션 {form.quizOptions.length}개 · 법령 {form.lawRefs.length}건</p>
            <p>
              정답 옵션:{" "}
              <span className="font-bold text-orange-300">
                {form.quizCorrectOptionId}
              </span>
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-navy-700 to-orange-550 px-5 py-3 text-sm font-black text-white orange-glow disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {status.kind === "saving" ? "저장 중..." : "데이터베이스에 저장"}
        </button>

        {status.kind === "ok" && (
          <div className="rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-4 text-xs text-emerald-100">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              <p className="font-black">저장 완료</p>
            </div>
            <p className="mt-1">
              slug: <span className="font-mono">{status.slug}</span>
            </p>
            <a
              href={`/stories/${status.slug}`}
              className="mt-2 inline-block rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 font-bold hover:bg-emerald-500/25"
            >
              스토리 페이지로 이동 →
            </a>
          </div>
        )}

        {status.kind === "error" && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-xs text-rose-100">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-300" />
              <p className="font-black">저장 실패</p>
            </div>
            <p className="mt-1 leading-relaxed">{status.message}</p>
          </div>
        )}
      </aside>
    </form>
  );
}

/* ── tiny field atoms ─────────────────────────────────────────── */

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass rounded-3xl p-5">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-black text-white">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-bold text-steel-300">
      {children}
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <Label>{label}</Label>
      <input
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white placeholder:text-steel-500 outline-none focus:border-orange-400/60"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="mt-3 block first:mt-0">
      {label && <Label>{label}</Label>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white placeholder:text-steel-500 outline-none focus:border-orange-400/60"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2 text-sm text-white outline-none focus:border-orange-400/60"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
