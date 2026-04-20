/**
 * Story domain types + (de)serialization helpers.
 * DB column 은 SQLite 이므로 JSON 필드를 문자열로 저장합니다.
 */

export type LawRef = { statute: string; clause: string; url?: string };

export type QuizOption = {
  id: string;
  label: string;
  alignment: number; // 0~100 — 실제 판례 결과와의 정합도
  commentary: string;
};

export type DisciplineStat = { type: string; count: number };

export type StoryDTO = {
  id: string;
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
  authorNote: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoryRow = {
  id: string;
  slug: string;
  title: string;
  hook: string;
  category: string;
  heroEmoji: string;
  stageStart: string;
  stageConflict: string;
  stageFall: string;
  outcome: string;
  lawRefs: string;
  quizQuestion: string;
  quizOptions: string;
  quizCorrectOptionId: string;
  disciplineStats: string;
  authorNote: string | null;
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function safeParse<T>(raw: string, fallback: T): T {
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function serializeStory(row: StoryRow): StoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    hook: row.hook,
    category: row.category,
    heroEmoji: row.heroEmoji,
    stageStart: row.stageStart,
    stageConflict: row.stageConflict,
    stageFall: row.stageFall,
    outcome: row.outcome,
    lawRefs: safeParse<LawRef[]>(row.lawRefs, []),
    quizQuestion: row.quizQuestion,
    quizOptions: safeParse<QuizOption[]>(row.quizOptions, []),
    quizCorrectOptionId: row.quizCorrectOptionId,
    disciplineStats: safeParse<DisciplineStat[]>(row.disciplineStats, []),
    authorNote: row.authorNote,
    published: row.published,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
