import Link from "next/link";
import {
  ArrowUpRight,
  Scale,
  MessagesSquare,
  BarChart3,
  ClipboardCheck,
  BookOpen,
} from "lucide-react";
import InstallCycleSetting from "@/components/eco/InstallCycleSetting";

/**
 * Main Home (/)
 * 사용자 요청 반영:
 * - 복잡한 위젯/로그를 줄이고 큰 제목 중심 랜딩 구성
 * - 핵심 기능 4개를 큰 카드로 안내
 */

const MAIN_PATHS = [
  {
    href: "/legal-guide",
    tag: "핵심 01",
    title: "Legal-Guide",
    description:
      "법령·판례 근거로 리스크를 즉시 진단하고, 지금 해야 할 조치까지 한 번에 확인합니다.",
    icon: Scale,
  },
  {
    href: "/stories",
    tag: "핵심 02",
    title: "Ethics-Drama",
    description:
      "실제 사례 기반 3막 드라마로 윤리 리스크를 직관적으로 학습합니다.",
    icon: BookOpen,
  },
  {
    href: "/dialogue",
    tag: "핵심 03",
    title: "Dialogue",
    description:
      "워크숍 실시간 참여, 투표, 감정 분석으로 현장 반응을 한눈에 확인합니다.",
    icon: MessagesSquare,
  },
  {
    href: "/intelligence-hub",
    tag: "핵심 04",
    title: "Intelligence Hub",
    description:
      "조직 리스크를 보고서로 자동 요약해 의사결정을 빠르게 돕는 프리미엄 진단 허브입니다.",
    icon: BarChart3,
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-8 md:space-y-10">
      <section className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-6 md:p-9">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative text-center">
          <p className="text-[12px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">lexguardai.vercel.app · AI 법률 방어 플랫폼</span>
          </p>
          <h1 className="mt-4 text-3xl font-black leading-tight text-white md:text-6xl">
            직장인·공직자를 위한
            <br />
            <span className="gradient-text">법률 리스크 방어</span>
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-[16px] leading-relaxed text-white/80 md:text-[20px]">
            복잡한 법률 문제를 빠르게 진단하고, 바로 실행 가능한 대응 가이드를 제공합니다.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              href="/legal-defense-draft"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-6 py-3 text-base font-black text-white sky-glow hover:opacity-95"
            >
              지금 시작하기
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <InstallCycleSetting />
        </div>
      </section>

      <section>
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-black text-white md:text-4xl">
            큰 제목을 눌러 바로 이동하세요
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {MAIN_PATHS.map((s) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.href}
                href={s.href}
                className="gradient-border group relative overflow-hidden rounded-3xl bg-navy-900/60 p-6 transition-all hover:shadow-[0_30px_80px_-30px_rgba(125,211,252,0.55)] md:p-8"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-400 via-indigo-400 to-violet-500"
                />
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-steel-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-300" />
                </div>
                <p className="text-[12px] font-black uppercase tracking-widest">
                  <span className="accent-text">{s.tag}</span>
                </p>
                <h3 className="mt-2 text-3xl font-black text-white md:text-4xl">
                  {s.title}
                </h3>
                <p className="mt-3 text-[15px] font-semibold leading-relaxed text-white/85 md:text-[17px]">
                  {s.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-3xl p-6 text-center md:p-8">
        <h2 className="text-2xl font-black text-white md:text-3xl">
          기관 맞춤형 커리큘럼이 필요하신가요?
        </h2>
        <p className="mt-2 text-[15px] text-steel-200">
          신청 폼에 고민만 입력하면 AI가 제안서를 자동 생성합니다.
        </p>
        <Link
          href="/apply"
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-500/10 px-5 py-3 text-sm font-black text-sky-200 hover:bg-sky-500/20"
        >
          <ClipboardCheck className="h-4 w-4" />
          신청하러 가기
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </section>
    </div>
  );
}

