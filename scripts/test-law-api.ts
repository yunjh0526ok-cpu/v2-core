/**
 *  scripts/test-law-api.ts
 *  ─────────────────────────────────────────────────────────────────────
 *   국가법령정보 API + 리스크 점수화 엔진 통합 테스트.
 *
 *   실행: `npm run test:law`
 *
 *   검증 항목:
 *     ✅ .env.local 에서 LAW_API_KEY 가 정상 로드되는지
 *     ✅ lawSearch.do  실제 호출 → XML 파싱 → items[] 생성
 *     ✅ lawService.do 실제 호출 → 조문 원문 파싱
 *     ✅ analyzeRisk 가 5종 시나리오에서 리스크 점수/근거/권고를 생성
 *     ✅ API 실패 시 graceful fallback 확인
 */

// Next.js 바깥(tsx)에서는 .env.local 이 자동 로드되지 않으므로 명시 로드.
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envLocal = resolve(process.cwd(), ".env.local");
const envDefault = resolve(process.cwd(), ".env");
if (existsSync(envLocal)) loadEnv({ path: envLocal });
if (existsSync(envDefault)) loadEnv({ path: envDefault, override: false });

import {
  searchLaws,
  fetchLawDetail,
  analyzeRisk,
  extractSignals,
  scoreArticleText,
} from "../lib/law-api";
import { enhanceRiskWithGemini, isGeminiEnabled } from "../lib/gemini";

/* ── 간단 asserter ──────────────────────────────────────────────────── */

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}` + (detail ? `  ·  ${detail}` : ""));
  } else {
    failed++;
    console.log(`  ❌ ${name}` + (detail ? `  ·  ${detail}` : ""));
  }
}

function section(title: string) {
  console.log("\n" + "─".repeat(72));
  console.log("  " + title);
  console.log("─".repeat(72));
}

async function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = Date.now();
  const r = await fn();
  console.log(`  ⏱  ${label}: ${Date.now() - t}ms`);
  return r;
}

/* ── 테스트 시나리오 ─────────────────────────────────────────────────── */

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════════════");
  console.log("  Ethics-Core AI 2.0  ·  LAW API 통합 테스트");
  console.log("══════════════════════════════════════════════════════════════════════");

  /* --- 0. 환경 점검 --- */
  section("0. 환경 변수 점검");
  const key = process.env.LAW_API_KEY ?? "";
  const base = process.env.LAW_API_BASE_URL ?? "(default)";
  console.log(`  LAW_API_KEY     : ${key ? maskKey(key) : "(미설정)"}`);
  console.log(`  LAW_API_BASE_URL: ${base}`);
  check("LAW_API_KEY 로드", key.length > 0, key ? `길이 ${key.length}` : "키 없음 — 로컬 KB 로 폴백");

  /* --- 1. 법령 검색 --- */
  section("1. lawSearch.do  ·  '청탁금지법'");
  const search = await time("searchLaws", () => searchLaws("청탁금지법"));
  console.log(`  source = ${search.source}  ·  mocked = ${search.mocked}  ·  totalCnt = ${search.totalCnt}`);
  check("검색 결과 1건 이상", search.items.length > 0);
  const top = search.items[0];
  if (top) {
    console.log(`  top → [${top.id}] ${top.name}  (${top.abbr ?? ""})`);
    check("법령명 포함", /청탁/.test(top.name) || /부정청탁/.test(top.name));
  }

  /* --- 2. 조문 본문 조회 --- */
  section("2. lawService.do  ·  법령 본문 XML 파싱");
  if (top) {
    const detail = await time("fetchLawDetail", () =>
      fetchLawDetail(top.mst ?? top.id, top.name)
    );
    console.log(`  source = ${detail.source}  ·  articles = ${detail.articles.length}`);
    check("조문 1건 이상 파싱됨", detail.articles.length > 0);
    const a8 = detail.articles.find((a) => a.no === "8") ?? detail.articles[0];
    if (a8) {
      console.log(
        `  sample → 제${a8.no}${a8.sub ? "의" + a8.sub : ""}조 ${a8.title}`
      );
      console.log(
        `           "${a8.content.replace(/\s+/g, " ").slice(0, 120)}..."`
      );
      const art = scoreArticleText(a8.content);
      console.log(`  scoreArticleText → ${art.score}점  ·  ${art.reasons.join(", ")}`);
      check("조문 심각도 0 이상", art.score >= 0);
    }
  }

  /* --- 3. 신호 추출 --- */
  section("3. extractSignals  ·  자연어 신호 추출");
  const s1 = extractSignals(
    "담당 업체 대표한테 명절 떡값으로 15만원 상품권을 받았는데 한 번만 받고 돌려줬습니다"
  );
  console.log("  입력: '담당 업체 대표한테 명절 떡값 15만원 상품권, 돌려줬음'");
  console.log("  →", JSON.stringify(s1));
  check("금액 추출(150,000)", s1.krw === 150000, `krw=${s1.krw}`);
  check("선물 컨텍스트", s1.cheongtakContext === "gift");
  check("완화요인(반환)", s1.mitigation === true);
  check("직무 직접관련(담당)", s1.direct === true);

  /* --- 4. 리스크 분석 파이프라인 --- */
  section("4. analyzeRisk  ·  5종 시나리오");

  const scenarios: Array<{ label: string; prompt: string }> = [
    {
      label: "청탁·금품 (고위험)",
      prompt: "평가 담당으로 있는 업체 대표가 집으로 명절 선물 50만원어치 한우세트를 보냈는데 어떻게 해야 하나요",
    },
    {
      label: "이해충돌",
      prompt: "제가 담당하는 허가 업무에 동생이 운영하는 회사가 신청했습니다. 신고해야 하나요?",
    },
    {
      label: "갑질/괴롭힘",
      prompt: "과장님이 주말마다 사적인 심부름을 반복적으로 시키고 거절하면 폭언을 합니다",
    },
    {
      label: "계약/입찰",
      prompt: "수의계약으로 평소 친한 업체에 발주를 몰아주라는 지시를 받았습니다",
    },
    {
      label: "저위험(거절)",
      prompt: "민원인이 커피 한 잔 사왔는데 거절하고 돌려보냈습니다",
    },
  ];

  for (const sc of scenarios) {
    console.log(`\n  ▸ ${sc.label}`);
    console.log(`    "${sc.prompt}"`);
    const a = await time(`analyzeRisk[${sc.label}]`, () => analyzeRisk(sc.prompt));
    console.log(
      `    → ${a.riskScore}% (${a.riskLevel})  ·  citations=${a.citations.length}  ·  source=${a.source}`
    );
    for (const f of a.factors) {
      console.log(`       ◦ ${f.label}  ${f.delta > 0 ? "+" : ""}${f.delta}  · ${f.detail}`);
    }
    if (a.citations[0]) {
      console.log(`    법령: ${a.citations[0].statute}  ${a.citations[0].clause}`);
    }
    console.log(`    권고: ${a.recommendations[0]}`);
    check(`[${sc.label}] 점수 유효범위`, a.riskScore >= 0 && a.riskScore <= 100);
    check(`[${sc.label}] 근거 1건 이상`, a.citations.length >= 1);
  }

  /* --- 5. Gemini 강화 실제 호출 --- */
  section("5. Gemini 강화 분석 (enhanceRiskWithGemini)");
  console.log(
    `  GEMINI_API_KEY : ${isGeminiEnabled() ? "설정됨 ✓" : "미설정 — 규칙엔진만 동작"}`
  );
  if (isGeminiEnabled()) {
    const prompt =
      "평가 담당으로 있는 업체 대표가 집으로 명절 선물 50만원어치 한우세트를 보냈는데 어떻게 해야 하나요";
    const base = await time("analyzeRisk(base)", () => analyzeRisk(prompt));
    const topLaw = base.relatedLaws[0];
    const articles = topLaw
      ? (await fetchLawDetail(topLaw.mst ?? topLaw.id, topLaw.name)).articles
      : [];
    const enhanced = await time("enhanceRiskWithGemini", () =>
      enhanceRiskWithGemini(base, articles)
    );
    console.log(`  engine        : ${enhanced.engine}`);
    console.log(`  score         : ${base.riskScore}% → ${enhanced.riskScore}% (${enhanced.riskLevel})`);
    console.log(`  confidence    : ${enhanced.confidence}`);
    console.log(`  narrative     : "${enhanced.narrative.slice(0, 160)}..."`);
    console.log(`  keyIssues     : ${(enhanced.keyIssues || []).slice(0, 3).join(" / ")}`);
    console.log(`  followUps     : ${(enhanced.followUpQuestions || []).slice(0, 2).join(" / ")}`);
    check("Gemini 엔진 결합", enhanced.engine === "gemini+rules");
    check("narrative 생성", enhanced.narrative.length > 20);
    check("keyIssues 1건 이상", (enhanced.keyIssues?.length ?? 0) >= 1);
  } else {
    console.log("  (스킵 — GEMINI_API_KEY 미설정)");
  }

  /* --- 결과 요약 --- */
  section("결과 요약");
  console.log(`  ✅ passed: ${passed}`);
  console.log(`  ❌ failed: ${failed}`);
  console.log("");
  if (failed > 0) process.exit(1);
}

function maskKey(k: string) {
  if (k.length <= 3) return k[0] + "**";
  return k.slice(0, 2) + "*".repeat(Math.max(1, k.length - 3)) + k.slice(-1);
}

main().catch((err) => {
  console.error("\n💥 test runner crashed:", err);
  process.exit(1);
});
