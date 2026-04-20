"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Scale,
  MessagesSquare,
  BarChart3,
  Activity,
  TrendingUp,
  ClipboardCheck,
  ShieldAlert,
  BookOpen,
} from "lucide-react";
import { ACTIVITY_FEED, type ActivityItem } from "@/lib/mock";
import TrendMini from "@/components/charts/TrendMini";
import AdminReformMarquee from "@/components/landing/AdminReformMarquee";
import LegalPrecedentMarquee from "@/components/legal/LegalPrecedentMarquee";
import QuickConsultBox from "@/components/legal/QuickConsultBox";

/**
 * Command Dashboard (/)
 * ─────────────────────────────────────────────────────────────────
 *  레이아웃 우선순위 (강사님 피드백 반영 v2):
 *    1) Hero  — 헤드라인 + Echo 인사
 *    2) Active-Admin / Regulatory-Reform Marquee (시인성 극대화 띠)
 *    3) 3대 핵심 솔루션 카드 (Legal-Guide · Ethics-Drama · Dialogue)
 *    4) Intelligence Hub 진입 밴드 + 부패방지 ↔ 적극행정 듀얼 축
 *    5) Ethics-Drama 임팩트 티저
 *    6) 빠른 실행 + 최근 운영 로그
 *    7) KPI(참고 지표) — 보조 정보로 맨 아래
 */

const SOLUTIONS = [
  {
    href: "/legal-guide",
    tag: "개인용 · 실전 법률 방어",
    title: "Legal-Guide",
    description:
      "부패 방지(청탁금지법·이해충돌·갑질 등 8대 유형 진단)부터 적극행정(면책제도·규제 샌드박스·우수사례)까지 — 국가법령 API + Gemini Pro 가 리스크%·근거 조문·예상 처분 수위·실전 가이드를 즉시 생성합니다.",
    metric: "부패방지 + 적극행정 통합",
    metricSub: "8대 유형 진단 · 면책 · 규제혁신",
    icon: Scale,
    gradient: "from-[#1a2d5a] via-[#24417f] to-[#ff7a1a]",
  },
  {
    href: "/stories",
    tag: "공직자 운명 시리즈",
    title: "Ethics-Drama",
    description:
      "국가법령 + 실제 판례 9편을 [유혹 · 적발 · 후폭풍] 3막 구조로. 키워드만 넣어도 실시간으로 3막 드라마가 만들어집니다.",
    metric: "실시간 드라마 생성기",
    metricSub: "9편 킬러 콘텐츠 + Dilemma Quiz",
    icon: BookOpen,
    gradient: "from-[#2a1538] via-[#6b2066] to-[#ff5a8a]",
  },
  {
    href: "/dialogue",
    tag: "강의·워크숍 실시간 참여",
    title: "Dialogue",
    description:
      "멘티미터·패들렛 스타일. QR 접속 수강생의 스마트폰에서 실시간 투표·의견이 감정 타임라인으로 흐릅니다.",
    metric: "맞춤 시나리오 워크숍",
    metricSub: "실시간 감정 타임라인 대시보드",
    icon: MessagesSquare,
    gradient: "from-[#1a2d5a] via-[#2f4fa3] to-[#ff5a8a]",
  },
];

const KPIS_SEED = [
  { label: "오늘의 AI 질의", value: "1,284", delta: "+12.4%", icon: Activity },
  { label: "활성 Dialogue 세션", value: "2", delta: "+1", icon: MessagesSquare },
  { label: "평균 법적 리스크", value: "37%", delta: "-4.2%", icon: ShieldAlert },
  { label: "이번달 신청서", value: "36", delta: "+9", icon: ClipboardCheck },
];

export default function Dashboard() {
  const [activity, setActivity] = useState<ActivityItem[]>(ACTIVITY_FEED);
  const [kpis] = useState(KPIS_SEED);

  useEffect(() => {
    const t = setTimeout(() => {
      setActivity((prev) => {
        const fresh: ActivityItem = {
          id: `live-${Date.now()}`,
          type: "legal",
          title: "법령 상담: 이해충돌 4촌 기준",
          time: "방금",
          detail: "리스크 76% → 서면 신고 권고",
        };
        return [fresh, ...prev].slice(0, 6);
      });
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-6 md:space-y-8">
      {/* ═══════════════ 1. HERO ═══════════════ */}
      <section className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-6 md:p-9">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="relative grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.22em]">
              <span className="accent-text">
                Ethics-Core AI 2.0 · Command Deck
              </span>
            </p>

            <h2 className="mt-3 text-2xl font-black leading-tight text-white sm:text-3xl md:text-[40px]">
              부패 리스크를 <span className="gradient-text">사전에 차단</span>
              하는 <br className="hidden md:block" />
              <span className="text-white">공직자의 청렴 파트너 플랫폼</span>
            </h2>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/80 md:text-[16px]">
              담당자님께는 <b className="text-white">실전형 AI 법률 방어 비서</b>,
              기관 관리자님께는 <b className="text-white">청렴도 자동화 SaaS</b>.
              Legal-Guide · Ethics-Drama · Dialogue · Intelligence Hub 가 하나의
              대시보드에서 유기적으로 연결됩니다.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/legal-guide"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-5 py-3 text-sm font-black text-white sky-glow hover:opacity-95"
              >
                <Scale className="h-4 w-4" />
                법률 심층 진단 시작
              </Link>
              <Link
                href="/stories"
                className="inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-500/10 px-5 py-3 text-sm font-black text-violet-100 hover:bg-violet-500/20"
              >
                <BookOpen className="h-4 w-4" />
                Ethics-Drama 9편 보기
              </Link>
              <Link
                href="/intelligence-hub"
                className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-bold text-steel-200 hover:bg-white/10"
              >
                진단 리포트 열기
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-sky-300/20 bg-navy-900/50 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-steel-200">
                6개월 청렴도 추이
              </p>
              <span className="flex items-center gap-1 text-xs font-black">
                <TrendingUp className="h-3.5 w-3.5 text-sky-300" />
                <span className="accent-text">+11pt</span>
              </span>
            </div>
            <div className="mt-3 h-28">
              <TrendMini />
            </div>
            <p className="mt-2 text-[11px] text-steel-400">
              기관 전체 · 2025.11 → 2026.04
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════════ 2. 3대 핵심 솔루션 ═══════════════ */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-xl font-black text-white md:text-2xl">
            <span className="gradient-text">3대 핵심 솔루션</span>
          </h3>
          <p className="hidden text-[13px] font-semibold text-steel-200 sm:block">
            카드를 클릭하면 실제 기능 페이지로 바로 이동합니다
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3 md:gap-5">
          {SOLUTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="gradient-border group relative overflow-hidden rounded-3xl bg-navy-900/60 p-5 transition-all hover:shadow-[0_30px_80px_-30px_rgba(125,211,252,0.55)] md:p-6"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-500"
                />
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-steel-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" />
                </div>
                <p className="text-[12px] font-black uppercase tracking-widest">
                  <span className="accent-text">{s.tag}</span>
                </p>
                <h4 className="mt-1.5 text-[24px] font-black text-white md:text-[26px]">
                  {s.title}
                </h4>
                <p className="mt-2.5 text-[15px] font-semibold leading-relaxed text-white/85 md:text-[15.5px]">
                  {s.description}
                </p>

                <div className="mt-5 flex items-center justify-between rounded-xl border border-sky-300/20 bg-navy-850/70 px-3.5 py-2.5">
                  <div>
                    <p className="text-[13.5px] font-black text-white">
                      {s.metric}
                    </p>
                    <p className="text-[12px] text-steel-300">{s.metricSub}</p>
                  </div>
                  <span className="rounded-full border border-sky-300/40 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-black text-sky-200">
                    Live
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ═══════════════ 3. Quick Consult + 실시간 법령·판례 분석 ═══════════════ */}
      <QuickConsultBox />
      <LegalPrecedentMarquee />

      {/* ═══════════════ 4. Active-Admin Marquee (적극행정·규제개혁) ═══════════════ */}
      <AdminReformMarquee />

      {/* ═══════════════ 5. Intelligence Hub 배너 ═══════════════ */}
      <section>
        <Link
          href="/intelligence-hub"
          className="gradient-border group relative flex flex-col items-start justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900/80 via-navy-800/70 to-navy-900/40 p-5 md:flex-row md:items-center md:p-7"
        >
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
              <BarChart3 className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[11.5px] font-black uppercase tracking-widest">
                <span className="accent-text">
                  Intelligence Hub · 기관용 B2B SaaS
                </span>
              </p>
              <h4 className="mt-1 text-xl font-black text-white md:text-[22px]">
                상담·토론·설문 데이터 → AI 진단 리포트 자동 생성
              </h4>
              <p className="mt-1.5 text-[14px] font-semibold text-white/85 md:text-[15px]">
                5축 리스크 레이더 · 부서별 편차 · Gemini 경영진 요약. 이사회
                보고서 수준의 청렴 진단을 즉시 출력합니다.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-500/10 px-4 py-2.5 text-[13px] font-black text-sky-200 group-hover:bg-sky-500/20">
            리포트 열기
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </Link>
      </section>

      {/* ═══════════════ 6. 빠른 실행 + 운영 로그 ═══════════════ */}
      <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="glass rounded-2xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black text-white">최근 운영 로그</h3>
            <span className="text-[11px] text-steel-400">실시간 스트림</span>
          </div>
          <ul className="space-y-2">
            {activity.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-navy-900/50 px-3 py-2.5 md:px-4 md:py-3"
              >
                <div className="min-w-0 pr-3">
                  <p className="truncate text-sm font-bold text-white">
                    {a.title}
                  </p>
                  <p className="truncate text-[11px] text-steel-400">
                    {a.detail}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-sky-300/40 bg-sky-500/10 px-2 py-0.5 text-[11px] font-black text-sky-200">
                  {a.time}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-black text-white">빠른 실행</h3>
          <p className="mt-1 text-[11px] text-steel-400">
            가장 많이 쓰는 작업을 바로 실행하세요
          </p>
          <div className="mt-4 grid gap-3">
            <QuickAction
              href="/legal-guide"
              title="심층 법률 진단"
              desc="상황 상세 입력 → 리스크% + 처분 예측 + 대응 가이드"
            />
            <QuickAction
              href="/stories"
              title="실시간 드라마 분석기"
              desc="키워드 한 줄 → 3막 드라마 + Dilemma Quiz"
            />
            <QuickAction
              href="/apply"
              title="맞춤 커리큘럼 제안서"
              desc="기관 고민 → AI PDF 제안서 자동 생성"
            />
            <QuickAction
              href="/dialogue"
              title="워크숍 라이브 세션"
              desc="QR 참여 · 감정 타임라인 실시간 분석"
            />
            <QuickAction
              href="/intelligence-hub"
              title="진단 리포트 생성"
              desc="부서 리스크 + 경영진 요약 자동화"
            />
          </div>
        </div>
      </section>

      {/* ═══════════════ 7. KPI (참고 지표) — 맨 아래 ═══════════════ */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-black text-steel-200">
            참고 지표 · 운영 현황
          </h3>
          <p className="text-[11px] text-steel-500">
            데이터베이스 기반 · 자동 집계
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            const positive = k.delta.startsWith("+");
            return (
              <div
                key={k.label}
                className="rounded-2xl border border-white/5 bg-navy-900/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-3.5 w-3.5 text-sky-300/85" />
                  <span
                    className={`text-[11px] font-black ${
                      positive ? "text-emerald-300" : "text-violet-200"
                    }`}
                  >
                    {k.delta}
                  </span>
                </div>
                <p className="mt-2 text-lg font-black text-white md:text-xl">
                  {k.value}
                </p>
                <p className="mt-0.5 text-[11px] text-steel-400">{k.label}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3 hover:border-sky-300/50"
    >
      <div>
        <p className="text-[14px] font-black text-white">{title}</p>
        <p className="mt-0.5 text-[12px] text-steel-300">{desc}</p>
      </div>
      <ArrowUpRight className="h-4 w-4 text-steel-400 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" />
    </Link>
  );
}

