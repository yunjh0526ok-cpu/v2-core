import type { DramatizeOutput } from "@/lib/gemini";

/** LiveDramaGenerator 가 기대하는 API 페이로드 (퀴즈 id·징계 분포 포함) */
export type LiveDramaApiPayload = {
  slug: string;
  title: string;
  hook: string;
  category: string;
  heroEmoji: string;
  stageStart: string;
  stageConflict: string;
  stageFall: string;
  outcome: string;
  lawRefs: Array<{ statute: string; clause: string }>;
  quizQuestion: string;
  quizOptions: Array<{
    id: string;
    label: string;
    alignment: number;
    commentary: string;
  }>;
  quizCorrectOptionId: string;
  disciplineStats: Array<{ type: string; count: number }>;
  authorNote?: string;
  engine: "gemini" | "fallback";
};

const DEFAULT_STATS: LiveDramaApiPayload["disciplineStats"] = [
  { type: "견책", count: 14 },
  { type: "감봉", count: 22 },
  { type: "정직", count: 28 },
  { type: "강등", count: 12 },
  { type: "해임", count: 6 },
  { type: "파면", count: 2 },
];

export function adaptDramatizeToLivePayload(
  d: DramatizeOutput,
  opts: { keyword: string; category?: string }
): LiveDramaApiPayload {
  const rawOpts = Array.isArray(d.quizOptions) ? d.quizOptions : [];
  const quizOptions = rawOpts.map((o, i) => ({
    id: `opt-${i}`,
    label: o.label,
    alignment: Math.max(0, Math.min(100, Math.round(Number(o.alignment) || 0))),
    commentary: o.commentary,
  }));
  let correctIdx = rawOpts.findIndex((o) => o.isCorrect);
  if (correctIdx < 0) correctIdx = 0;
  const quizCorrectOptionId =
    quizOptions[correctIdx]?.id ?? quizOptions[0]?.id ?? "opt-0";

  const usingBuiltinQuiz = quizOptions.length < 2;
  const safeQuiz = usingBuiltinQuiz
    ? [
        {
          id: "opt-0",
          label: "즉시 거절하고 내부 기록을 남긴다",
          alignment: 92,
          commentary: "현장 즉시 거절·기록이 판례상 가장 안전한 대응입니다.",
        },
        {
          id: "opt-1",
          label: "일단 수령 후 사후 보고한다",
          alignment: 18,
          commentary: "사후 보고만으로는 위반 소지가 남을 수 있습니다.",
        },
      ]
    : quizOptions;

  const kw = opts.keyword.trim();
  const cat =
    (opts.category && opts.category.trim()) ||
    (kw.length > 18 ? `${kw.slice(0, 18)}…` : kw) ||
    "실시간 생성";

  return {
    slug: d.slug || "live-drama",
    title: d.title,
    hook: d.hook,
    category: cat,
    heroEmoji: d.heroEmoji || "⚖️",
    stageStart: d.stageStart,
    stageConflict: d.stageConflict,
    stageFall: d.stageFall,
    outcome: d.outcome,
    lawRefs: [
      {
        statute: "국가공무원법",
        clause: "제60조(근무성적평정 등), 제61조(청렴의 의무)",
      },
      {
        statute: "공무원 징계령 등",
        clause: "별표 징계기준·중대성 판단 시 참고",
      },
    ],
    quizQuestion: d.quizQuestion || "이 상황에서 가장 안전한 선택은 무엇일까요?",
    quizOptions: safeQuiz,
    quizCorrectOptionId: usingBuiltinQuiz
      ? "opt-0"
      : safeQuiz.some((q) => q.id === quizCorrectOptionId)
        ? quizCorrectOptionId
        : (safeQuiz[0]?.id ?? "opt-0"),
    disciplineStats: DEFAULT_STATS,
    authorNote: d.authorNote,
    engine: d.engine === "gemini" ? "gemini" : "fallback",
  };
}
