"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, Menu, Search, ShieldAlert } from "lucide-react";

const TITLES: Record<string, { title: string; sub: string }> = {
  "/": {
    title: "Command Dashboard",
    sub: "3대 핵심 솔루션 · 실시간 리스크 모니터링",
  },
  "/legal-guide": {
    title: "Legal-Guide",
    sub: "국가법령 API 연동 AI 법률 상담",
  },
  "/dialogue": {
    title: "Dialogue",
    sub: "실시간 투표 · 토론 · 감정 분석",
  },
  "/intelligence-hub": {
    title: "Intelligence Hub",
    sub: "조직 청렴 데이터 · 보고서 자동 생성",
  },
  "/hub": {
    title: "Intelligence Hub",
    sub: "조직 청렴 데이터 · 보고서 자동 생성",
  },
  "/stories": {
    title: "Ethics-Drama",
    sub: "판례 비하인드 · Dilemma Quiz · 징계수위 시뮬레이터",
  },
  "/apply": {
    title: "Smart Application",
    sub: "기관 맞춤형 커리큘럼 AI 설계",
  },
};

export default function Topbar() {
  const pathname = usePathname();
  const key = Object.keys(TITLES)
    .sort((a, b) => b.length - a.length)
    .find((k) => (k === "/" ? pathname === "/" : pathname.startsWith(k)));
  const meta = TITLES[key ?? "/"];

  const openDrawer = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("app:open-drawer"));
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-navy-950/70 backdrop-blur-xl">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* 모바일 햄버거 버튼 — 사이드바가 숨겨진 브레이크포인트에서만 노출 */}
          <button
            type="button"
            onClick={openDrawer}
            aria-label="메뉴 열기"
            className="shrink-0 rounded-xl border border-white/10 bg-navy-850/60 p-2 text-sky-200 hover:bg-navy-800/80 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <Link
            href="/"
            aria-label="Ethics-Core AI 메인 대시보드(Home)"
            className="group min-w-0 rounded-xl px-2 py-1 transition-all hover:bg-white/[0.03]"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] md:text-[11px]">
              <span className="accent-text">LexGuard.kr</span>
            </p>
            <h1 className="truncate text-base font-black text-white md:text-xl break-keep">
              {meta.title}
            </h1>
            <p className="hidden text-[12.5px] font-semibold text-white/75 break-keep sm:block">
              {meta.sub}
            </p>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-navy-850/60 px-3 py-2 text-xs text-steel-300 lg:flex">
            <Search className="h-3.5 w-3.5" />
            <input
              placeholder="법령 / 기관 / 세션 검색"
              className="w-64 bg-transparent text-steel-300 placeholder:text-steel-500 outline-none"
            />
            <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-steel-400">
              Ctrl K
            </span>
          </div>

          <button
            type="button"
            className="relative rounded-xl border border-white/10 bg-navy-850/60 p-2 text-steel-300 hover:text-white"
            title="알림"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-400" />
          </button>

          <Link
            href="/legal-guide"
            className="hidden items-center gap-2 rounded-xl border border-sky-300/40 bg-sky-500/10 px-3 py-2 text-[12px] font-black text-sky-200 hover:bg-sky-500/20 sm:flex"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            긴급 리스크 체크
          </Link>
        </div>
      </div>
    </header>
  );
}
