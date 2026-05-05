/**
 *  prisma/seed.ts — Ethics-Drama 9편 킬러 스토리 라이브러리
 *  ─────────────────────────────────────────────────────────────────────
 *   국가법령정보 공동활용 + 실제 판례·처분 데이터 기반.
 *   9개 유형:
 *     1) 행동강령 (청탁·금품 수수 미신고)
 *     2) 부당지시 (상급자 부당지시 불복 미이행)
 *     3) 인사 공정성 (승진·채용 청탁)
 *     4) 금품수수 (고액 향응)
 *     5) 이해충돌 (친족 계약)
 *     6) 갑질 (직장 내 괴롭힘)
 *     7) 복무위반 (영리 겸직·무단결근)
 *     8) 적극행정 면책 (긍정 사례)
 *     9) 규제혁신 성공 (긍정 사례)
 *
 *   모든 스토리: [유혹(발단) → 적발(갈등) → 후폭풍(파멸/결과)] 3막 구조.
 *   실명·실제 기관명은 익명화. 판결·징계 수위는 실제 판례 평균에 기반.
 *
 *   본문 데이터는 lib/ethicsDramaSeedData.ts 에 단일 정의됩니다.
 */

import { PrismaClient } from "../lib/generated/prisma";
import { ETHICS_DRAMA_STORY_SEEDS as STORIES } from "../lib/ethicsDramaSeedData";

const prisma = new PrismaClient();

async function main() {
  console.log("[seed] purging existing stories...");
  await prisma.story.deleteMany();

  for (const s of STORIES) {
    await prisma.story.create({
      data: {
        slug: s.slug,
        title: s.title,
        hook: s.hook,
        category: s.category,
        heroEmoji: s.heroEmoji,
        stageStart: s.stageStart,
        stageConflict: s.stageConflict,
        stageFall: s.stageFall,
        outcome: s.outcome,
        lawRefs: JSON.stringify(s.lawRefs),
        quizQuestion: s.quizQuestion,
        quizOptions: JSON.stringify(s.quizOptions),
        quizCorrectOptionId: s.quizCorrectOptionId,
        disciplineStats: JSON.stringify(s.disciplineStats),
        authorNote: s.authorNote ?? null,
        published: true,
      },
    });
    console.log(`  + [${s.category}] ${s.title}`);
  }

  console.log(`[seed] done. ${STORIES.length} stories inserted.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
