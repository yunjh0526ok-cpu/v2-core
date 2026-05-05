import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  serializeStory,
  mergePublishedStoriesWithSeeds,
  type LawRef,
} from "@/lib/story";
import { ETHICS_DRAMA_STORY_SEEDS } from "@/lib/ethicsDramaSeedData";
import { ArrowUpRight, BookOpen, Film, Sparkles } from "lucide-react";
import DramaHeroTitle from "@/components/stories/DramaHeroTitle";
import LiveDramaGenerator from "@/components/stories/LiveDramaGenerator";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

/**
 *  카드 하단 "법령 태그" 중복 제거 + 조문 구체화 로직
 *   · 동일 (statute, clause) 쌍은 1회만
 *   · 동일 statute 에서 clause 가 다를 경우 각각 별도 칩으로 노출
 *   · 카드엔 짧은 폼(예: "청탁금지법 §8") 만 표기, 툴팁(title)에 풀 텍스트
 */
function dedupLawTags(
  refs: LawRef[]
): { short: string; full: string }[] {
  const seen = new Set<string>();
  const out: { short: string; full: string }[] = [];
  for (const r of refs) {
    const key = `${r.statute}__${r.clause}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const full = `${r.statute} ${r.clause}`.trim();
    // 조문 번호 추출: "제8조" 같은 패턴을 §8 로 줄임
    const match = r.clause?.match(/제\s*(\d+)\s*조(?:의?\s*\d+)?/);
    const num = match ? match[0].replace(/\s+/g, "") : null;
    const short = num ? `${r.statute} §${num.replace(/제|조/g, "")}` : full;
    out.push({ short, full });
  }
  return out;
}

export const metadata = {
  title: "Ethics-Drama · lexguardai.vercel.app",
  description:
    "국가법령·실제 판례 기반 9편 킬러 스토리 + 실시간 드라마 분석기. 그 선택의 순간을 함께 경험하세요.",
};

export const dynamic = "force-dynamic";

export default async function StoriesIndexPage() {
  let rows: Awaited<ReturnType<typeof prisma.story.findMany>> = [];
  try {
    rows = await prisma.story.findMany({
      where: { published: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("[stories] failed to load stories:", error);
  }
  const stories = mergePublishedStoriesWithSeeds(
    rows.map(serializeStory),
    ETHICS_DRAMA_STORY_SEEDS
  );

  return (
    <div className="space-y-6 md:space-y-8">
      <Breadcrumbs items={[{ label: "Ethics-Drama" }]} />
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <p className="text-[11.5px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">Ethics-Drama · 공직자 운명 시리즈</span>
          </p>

          {/* 10개 임팩트 타이틀 중 랜덤 로테이션 */}
          <DramaHeroTitle />

          <p className="mt-4 max-w-2xl text-[14.5px] font-semibold leading-relaxed text-white/85 md:text-[15.5px]">
            <b className="text-white">국가법령정보 공동활용 API</b> 와{" "}
            <b className="text-white">실제 판례·처분 데이터</b> 를 기반으로 구성한
            9편의 킬러 콘텐츠. 각 스토리는{" "}
            <span className="accent-chip">유혹 → 적발 → 후폭풍</span> 3막 구조 +
            Dilemma Quiz + 예상 징계 수위 시뮬레이터로 설계되었습니다.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="#live-drama"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2.5 text-[13px] font-black text-white sky-glow hover:opacity-95"
            >
              <Film className="h-3.5 w-3.5" />
              실시간 드라마 분석기 체험
            </a>
            <span className="inline-flex items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-500/10 px-4 py-2.5 text-[13px] font-black text-sky-100">
              <BookOpen className="h-3.5 w-3.5" />총 {stories.length}편 수록
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[12.5px] font-bold text-steel-200">
              <Sparkles className="h-3.5 w-3.5 text-violet-300" />
              행동강령 · 부당지시 · 인사·금품 · 이해충돌 · 갑질 · 복무 · 적극행정 · 규제개혁
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════ LIVE DRAMA ANALYZER ═══════════════ */}
      <div id="live-drama" className="scroll-mt-24">
        <LiveDramaGenerator />
      </div>

      {/* ═══════════════ 9편 라이브러리 ═══════════════ */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xl font-black text-white md:text-2xl">
            <span className="gradient-text">킬러 스토리 라이브러리</span>
          </h3>
          <p className="hidden text-[13px] font-semibold text-steel-200 sm:block">
            카드를 클릭하면 3막 카드뉴스 + Dilemma Quiz 로 진입합니다
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3">
          {stories.map((s) => {
            const tags = dedupLawTags(s.lawRefs).slice(0, 3);
            return (
              <Link
                key={s.id}
                href={`/stories/${s.slug}`}
                className="gradient-border group relative flex flex-col overflow-hidden rounded-3xl bg-navy-900/60 p-5 transition-all hover:shadow-[0_30px_80px_-30px_rgba(125,211,252,0.55)]"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-3xl">
                    {s.heroEmoji}
                  </div>
                  <span className="rounded-full border border-sky-300/40 bg-sky-500/10 px-2.5 py-1 text-[12px] font-black text-sky-100">
                    {s.category}
                  </span>
                </div>
                <h3 className="text-xl font-black leading-snug text-white md:text-[22px]">
                  {s.title}
                </h3>
                <p className="mt-2 text-[14.5px] font-semibold leading-relaxed text-white/85 md:text-[15px]">
                  {s.hook}
                </p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {tags.map((t, i) => (
                    <span
                      key={i}
                      className="rounded-full border border-sky-300/25 bg-gradient-to-r from-sky-500/15 to-violet-500/15 px-2.5 py-1 text-[11.5px] font-black text-white/95"
                      title={t.full}
                    >
                      <span className="accent-text">{t.short}</span>
                    </span>
                  ))}
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                  <span className="text-[12px] font-bold text-steel-300">
                    3단 스토리 · Dilemma Quiz · 징계 차트
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-steel-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" />
                </div>
              </Link>
            );
          })}

          {stories.length === 0 && (
            <div className="glass col-span-full rounded-3xl p-10 text-center">
              <p className="text-sm text-steel-300">
                아직 등록된 판례 스토리가 없습니다.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
