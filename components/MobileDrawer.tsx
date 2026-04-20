"use client";

/**
 *  components/MobileDrawer.tsx
 *  ───────────────────────────────
 *  모바일/태블릿 전용 슬라이드-인 내비게이션.
 *  - 데스크톱 Sidebar 와 동일한 메뉴 트리를 노출한다.
 *  - 햄버거 버튼(Topbar) 에서 `window.dispatchEvent(new Event("app:open-drawer"))`
 *    를 쏘면 열린다.
 *  - ESC · 오버레이 클릭 · 메뉴 클릭 시 자동으로 닫힘.
 *  - `md:` 브레이크포인트 이상에서는 렌더되지 않는다 (Sidebar 가 대체).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Scale,
  MessagesSquare,
  BarChart3,
  ClipboardCheck,
  ShieldCheck,
  BookOpen,
  Lock,
  X,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tag: "HOME" },
  { href: "/legal-guide", label: "Legal-Guide", icon: Scale, tag: "분석" },
  { href: "/stories", label: "Ethics-Drama", icon: BookOpen, tag: "스토리" },
  { href: "/dialogue", label: "Dialogue", icon: MessagesSquare, tag: "토론" },
  {
    href: "/intelligence-hub",
    label: "Intelligence Hub",
    icon: BarChart3,
    tag: "리포트",
  },
  { href: "/apply", label: "Apply", icon: ClipboardCheck, tag: "신청" },
  { href: "/admin", label: "Admin Console", icon: Lock, tag: "관리자" },
];

export default function MobileDrawer() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    const openHandler = () => setOpen(true);
    const toggleHandler = () => setOpen((v) => !v);
    window.addEventListener("app:open-drawer", openHandler);
    window.addEventListener("app:toggle-drawer", toggleHandler);
    return () => {
      window.removeEventListener("app:open-drawer", openHandler);
      window.removeEventListener("app:toggle-drawer", toggleHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 라우트 이동은 Link 자체의 onClick={close} 로 닫힘 — 별도 effect 불필요
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="메인 내비게이션"
    >
      {/* overlay */}
      <div
        onClick={close}
        className="absolute inset-0 bg-navy-950/80 backdrop-blur-sm"
      />

      {/* drawer */}
      <aside
        className="relative h-full w-[82vw] max-w-[320px] border-r border-white/10 bg-navy-950/95 px-4 py-5 shadow-2xl"
        style={{ animation: "drawer-slide-in 220ms ease-out" }}
      >
        <div className="flex items-center justify-between">
          <Link
            href="/"
            onClick={close}
            className="group flex items-center gap-3 rounded-xl px-2 py-1 transition-all hover:bg-white/[0.03]"
          >
            <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-black tracking-wide text-white">
                Ethics-Core AI
              </p>
              <p className="accent-text text-[11px] break-keep">
                청렴공정 AI 센터 · 2.0
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="rounded-lg border border-white/10 p-1.5 text-steel-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="mt-5 flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            const isHome = item.href === "/";
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                className={`group flex items-center justify-between rounded-xl px-3 py-3 text-[14px] transition-all ${
                  active
                    ? "bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-violet-500/15 text-white accent-border"
                    : "text-steel-200 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 ${
                      active ? "text-sky-300" : "text-steel-400"
                    }`}
                  />
                  <span className="font-semibold break-keep">
                    {item.label}
                  </span>
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-black break-keep ${
                    isHome
                      ? "border-sky-300/60 bg-sky-500/15 text-sky-200"
                      : active
                        ? "border-violet-400/50 text-violet-200"
                        : "border-white/10 text-steel-400"
                  }`}
                >
                  {item.tag}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-2xl border border-sky-300/20 bg-navy-900/60 p-3 text-[11.5px] leading-relaxed text-steel-300 break-keep">
          국가법령 API · 실제 판례 17,902건 학습 완료.
          <br />
          상단 로고 → 대시보드(Home) 언제든 복귀.
        </div>
      </aside>
    </div>
  );
}
