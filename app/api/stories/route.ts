import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { serializeStory } from "@/lib/story";

export const runtime = "nodejs";

const LawRefSchema = z.object({
  statute: z.string(),
  clause: z.string(),
  url: z.string().optional(),
});

const QuizOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  alignment: z.number().min(0).max(100),
  commentary: z.string(),
});

const DisciplineSchema = z.object({
  type: z.string(),
  count: z.number().int().min(0),
});

const StorySchema = z.object({
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "슬러그는 영문소문자/숫자/하이픈만"),
  title: z.string().min(1),
  hook: z.string().min(1),
  category: z.string().min(1),
  heroEmoji: z.string().default("⚖️"),
  stageStart: z.string().min(1),
  stageConflict: z.string().min(1),
  stageFall: z.string().min(1),
  outcome: z.string().min(1),
  lawRefs: z.array(LawRefSchema).min(1),
  quizQuestion: z.string().min(1),
  quizOptions: z.array(QuizOptionSchema).min(2),
  quizCorrectOptionId: z.string().min(1),
  disciplineStats: z.array(DisciplineSchema).min(1),
  authorNote: z.string().optional(),
  published: z.boolean().default(true),
});

export async function GET() {
  const stories = await prisma.story.findMany({
    where: { published: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    ok: true,
    data: stories.map(serializeStory),
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 }
    );
  }
  const parsed = StorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const d = parsed.data;
  // quizCorrectOptionId 가 실제 옵션 중 하나인지 확인
  if (!d.quizOptions.find((o) => o.id === d.quizCorrectOptionId)) {
    return NextResponse.json(
      {
        ok: false,
        error: "VALIDATION",
        details: [{ message: "quizCorrectOptionId 가 옵션 목록에 없습니다" }],
      },
      { status: 400 }
    );
  }

  const created = await prisma.story.upsert({
    where: { slug: d.slug },
    create: {
      slug: d.slug,
      title: d.title,
      hook: d.hook,
      category: d.category,
      heroEmoji: d.heroEmoji,
      stageStart: d.stageStart,
      stageConflict: d.stageConflict,
      stageFall: d.stageFall,
      outcome: d.outcome,
      lawRefs: JSON.stringify(d.lawRefs),
      quizQuestion: d.quizQuestion,
      quizOptions: JSON.stringify(d.quizOptions),
      quizCorrectOptionId: d.quizCorrectOptionId,
      disciplineStats: JSON.stringify(d.disciplineStats),
      authorNote: d.authorNote ?? null,
      published: d.published,
    },
    update: {
      title: d.title,
      hook: d.hook,
      category: d.category,
      heroEmoji: d.heroEmoji,
      stageStart: d.stageStart,
      stageConflict: d.stageConflict,
      stageFall: d.stageFall,
      outcome: d.outcome,
      lawRefs: JSON.stringify(d.lawRefs),
      quizQuestion: d.quizQuestion,
      quizOptions: JSON.stringify(d.quizOptions),
      quizCorrectOptionId: d.quizCorrectOptionId,
      disciplineStats: JSON.stringify(d.disciplineStats),
      authorNote: d.authorNote ?? null,
      published: d.published,
    },
  });

  return NextResponse.json({ ok: true, data: serializeStory(created) });
}
