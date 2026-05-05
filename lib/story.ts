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

/** Bundled seed row (e.g. `lib/ethicsDramaSeedData`) — same narrative fields as DB row, no id/dates. */
export type StorySeedFields = Omit<
  StoryDTO,
  "id" | "published" | "createdAt" | "updatedAt" | "authorNote"
> & { authorNote?: string | null };

const SEED_FALLBACK_TIMESTAMP = "2024-01-15T00:00:00.000Z";

export function storySeedToDTO(seed: StorySeedFields): StoryDTO {
  return {
    id: `seed:${seed.slug}`,
    slug: seed.slug,
    title: seed.title,
    hook: seed.hook,
    category: seed.category,
    heroEmoji: seed.heroEmoji,
    stageStart: seed.stageStart,
    stageConflict: seed.stageConflict,
    stageFall: seed.stageFall,
    outcome: seed.outcome,
    lawRefs: Array.isArray(seed.lawRefs) ? seed.lawRefs : [],
    quizQuestion: seed.quizQuestion,
    quizOptions: Array.isArray(seed.quizOptions) ? seed.quizOptions : [],
    quizCorrectOptionId: seed.quizCorrectOptionId,
    disciplineStats: Array.isArray(seed.disciplineStats)
      ? seed.disciplineStats
      : [],
    authorNote: seed.authorNote ?? null,
    published: true,
    createdAt: SEED_FALLBACK_TIMESTAMP,
    updatedAt: SEED_FALLBACK_TIMESTAMP,
  };
}

export function storySeedsToDTOs(seeds: StorySeedFields[]): StoryDTO[] {
  return seeds.map(storySeedToDTO);
}

/** DB 행과 번들 시드를 slug 기준 병합: 동일 slug는 DB가 우선, 시드 순서로 9편을 앞에 고정. */
export function mergePublishedStoriesWithSeeds(
  dbRows: StoryDTO[],
  seeds: StorySeedFields[]
): StoryDTO[] {
  const fromSeeds = storySeedsToDTOs(seeds);
  const bySlug = new Map<string, StoryDTO>();
  for (const s of fromSeeds) bySlug.set(s.slug, s);
  for (const r of dbRows) bySlug.set(r.slug, r);
  const order = seeds.map((s) => s.slug);
  const ordered = order
    .map((slug) => bySlug.get(slug))
    .filter((x): x is StoryDTO => Boolean(x));
  const extras = dbRows.filter((r) => !order.includes(r.slug));
  return [...ordered, ...extras];
}
