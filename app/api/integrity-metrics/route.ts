/**
 *  /api/integrity-metrics
 *  ─────────────────────────────────────────────────────────────────────
 *   Intelligence Hub 대시보드가 읽는 통합 지표 API.
 *   소스: Consultation(Legal-Guide 상담) + Application(/apply) + Story + DialogueFeedback
 *
 *   응답:
 *     - kpi (상담/신청/평균리스크/고위험%)
 *     - trend (최근 14일 일별 시계열)
 *     - scenarioBreakdown (시나리오 분포)
 *     - riskRadar (5축)
 *     - departmentRisk (부서별)
 *     - recentConsultations (최근 상담 10건)
 *     - dialogueHighlights (최근 감정 요약)
 *     - report (Gemini 자동 생성 진단 리포트)
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateDiagnosticReport } from "@/lib/gemini";

export const runtime = "nodejs";
// 빌드 시점 prerender 방지 — DB 필요
export const dynamic = "force-dynamic";

const DAYS = 14;

export async function GET() {
  const since = new Date();
  since.setDate(since.getDate() - DAYS);

  const [consultations, applications, stories, dialogue] = await Promise.all([
    prisma.consultation.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.application.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.story.count({ where: { published: true } }),
    prisma.dialogueFeedback.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ]);

  const riskScores = consultations.map((c) => c.riskScore);
  const avgRisk =
    riskScores.length > 0
      ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
      : 0;
  const highRiskCount = consultations.filter(
    (c) => c.riskLevel === "HIGH" || c.riskLevel === "CRITICAL"
  ).length;
  const highRiskRatio =
    consultations.length > 0
      ? Math.round((highRiskCount / consultations.length) * 100)
      : 0;

  // ── 일별 시계열 ────────────────────────────────────────────────
  const trend: Array<{ date: string; count: number; avgRisk: number }> = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dayItems = consultations.filter(
      (c) => c.createdAt.toISOString().slice(0, 10) === iso
    );
    const avg =
      dayItems.length > 0
        ? Math.round(dayItems.reduce((a, b) => a + b.riskScore, 0) / dayItems.length)
        : 0;
    trend.push({ date: iso.slice(5), count: dayItems.length, avgRisk: avg });
  }

  // ── 시나리오 분포 ──────────────────────────────────────────────
  const scenarioMap = new Map<string, number>();
  for (const c of consultations) {
    scenarioMap.set(c.scenario, (scenarioMap.get(c.scenario) ?? 0) + 1);
  }
  const scenarioBreakdown = Object.fromEntries(scenarioMap);

  // ── 리스크 레이더(5축) ────────────────────────────────────────
  const riskRadar = [
    { axis: "금품·청탁", value: scoreAxis(consultations, "cheongtak") },
    { axis: "이해충돌", value: scoreAxis(consultations, "ihae") },
    { axis: "갑질·괴롭힘", value: scoreAxis(consultations, "gabjil") },
    { axis: "계약·입찰", value: scoreAxis(consultations, "contract") },
    { axis: "정보 관리", value: scoreAxis(consultations, "info") },
  ];

  // ── 부서별 리스크 (department 필드 기준) ─────────────────────
  const deptMap = new Map<string, { sum: number; n: number }>();
  for (const c of consultations) {
    if (!c.department) continue;
    const s = deptMap.get(c.department) ?? { sum: 0, n: 0 };
    s.sum += c.riskScore;
    s.n += 1;
    deptMap.set(c.department, s);
  }
  const departmentRisk = Array.from(deptMap.entries()).map(([department, v]) => ({
    department,
    score: Math.round(v.sum / v.n),
    count: v.n,
  }));

  // ── 대화 하이라이트 ──────────────────────────────────────────
  const sentimentCount = { positive: 0, neutral: 0, concern: 0, negative: 0 };
  for (const d of dialogue) {
    const s = d.sentiment as keyof typeof sentimentCount | null;
    if (s && s in sentimentCount) sentimentCount[s] += 1;
  }
  const dialogueHighlights = dialogue
    .filter((d) => d.text)
    .slice(0, 5)
    .map((d) => `[${d.sentiment ?? "…"}] ${d.text!.slice(0, 80)}`);

  // ── Gemini 자동 리포트 (없으면 규칙 기반 폴백) ────────────────
  const report = await generateDiagnosticReport({
    consultationCount: consultations.length,
    scenarioBreakdown: scenarioBreakdown as Record<string, number>,
    recentRiskScores: riskScores.slice(0, 20),
    departmentRisk,
    dialogueHighlights,
  });

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    window: `${DAYS}d`,
    kpi: {
      consultations: consultations.length,
      applications: applications.length,
      publishedStories: stories,
      avgRisk,
      highRiskRatio,
      highRiskCount,
    },
    trend,
    scenarioBreakdown,
    riskRadar,
    departmentRisk,
    dialogueSentiment: sentimentCount,
    dialogueHighlights,
    recentConsultations: consultations.slice(0, 10).map((c) => ({
      id: c.id,
      scenario: c.scenario,
      riskScore: c.riskScore,
      riskLevel: c.riskLevel,
      engine: c.engine,
      department: c.department,
      createdAt: c.createdAt,
      promptExcerpt: c.prompt.slice(0, 80),
    })),
    report,
  });
}

function scoreAxis(
  consultations: Array<{ scenario: string; riskScore: number }>,
  tag: string
): number {
  const xs = consultations.filter((c) => c.scenario === tag);
  if (xs.length === 0) return 0;
  const avg = xs.reduce((a, b) => a + b.riskScore, 0) / xs.length;
  return Math.round(avg);
}
