"use client";

import Link from "next/link";
import { Home, ChevronRight } from "lucide-react";

/**
 *  components/nav/Breadcrumbs.tsx
 *  ───────────────────────────────
 *   상세 페이지 상단에 위치하는 경로 표시.
 *   예: <Breadcrumbs items={[{ label: "Legal-Guide" }]} />
 *       → Home > Legal-Guide
 *
 *   - 'Home' 클릭 시 / (대시보드) 로 이동
 *   - 중간 항목도 href 지정 가능
 */

export type Crumb = {
  label: string;
  href?: string;
};

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="경로 표시"
      className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-xl border border-sky-300/15 bg-navy-900/40 px-3 py-2 text-[13px] font-semibold backdrop-blur break-keep"
    >
      <Link
        href="/"
        className="group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-white/80 transition-all hover:bg-sky-500/10 hover:text-white"
        aria-label="대시보드(Home)로 돌아가기"
      >
        <Home className="h-3.5 w-3.5 text-sky-300 transition-transform group-hover:-translate-y-0.5" />
        <span className="accent-text text-[12px] font-black uppercase tracking-[0.18em]">
          Home
        </span>
      </Link>

      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <div key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-steel-500" />
            {c.href && !last ? (
              <Link
                href={c.href}
                className="rounded-lg px-2 py-1 text-white/80 hover:bg-white/[0.04] hover:text-white"
              >
                {c.label}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={`rounded-lg px-2 py-1 ${
                  last ? "text-white" : "text-white/70"
                } font-black`}
              >
                {c.label}
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
