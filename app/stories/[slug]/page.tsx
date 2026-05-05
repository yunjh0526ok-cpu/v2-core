import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { serializeStory, storySeedToDTO } from "@/lib/story";
import { ETHICS_DRAMA_STORY_SEEDS } from "@/lib/ethicsDramaSeedData";
import StoryDetail from "@/components/stories/StoryDetail";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  let story: Awaited<ReturnType<typeof prisma.story.findUnique>> = null;
  try {
    story = await prisma.story.findUnique({ where: { slug } });
  } catch (error) {
    console.error("[stories/slug] metadata load failed:", error);
  }
  const seed = ETHICS_DRAMA_STORY_SEEDS.find((s) => s.slug === slug);
  const title = story
    ? `${story.title} · Ethics-Drama`
    : seed
      ? `${seed.title} · Ethics-Drama`
      : null;
  const description = story?.hook ?? seed?.hook;
  if (!title) return { title: "Ethics-Drama · lexguardai.vercel.app" };
  return { title, description: description ?? undefined };
}

export default async function StoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  let row: Awaited<ReturnType<typeof prisma.story.findUnique>> = null;
  try {
    row = await prisma.story.findUnique({ where: { slug } });
  } catch (error) {
    console.error("[stories/slug] page load failed:", error);
  }
  const seed = ETHICS_DRAMA_STORY_SEEDS.find((s) => s.slug === slug);
  const story =
    row?.published ? serializeStory(row) : seed ? storySeedToDTO(seed) : null;
  if (!story) notFound();

  return (
    <div className="space-y-5 md:space-y-7">
      <Link
        href="/stories"
        className="inline-flex items-center gap-1 text-xs font-bold text-steel-300 hover:text-orange-300"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        전체 Ethics-Drama 목록으로
      </Link>
      <StoryDetail story={story} />
    </div>
  );
}
