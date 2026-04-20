import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { serializeStory } from "@/lib/story";
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
  const story = await prisma.story.findUnique({ where: { slug } });
  if (!story) return { title: "Ethics-Drama · Ethics-Core AI 2.0" };
  return {
    title: `${story.title} · Ethics-Drama`,
    description: story.hook,
  };
}

export default async function StoryPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const row = await prisma.story.findUnique({ where: { slug } });
  if (!row || !row.published) notFound();
  const story = serializeStory(row);

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
