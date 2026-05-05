"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Scale,
  MessagesSquare,
  BarChart3,
  ClipboardCheck,
  FilePenLine,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Lock,
} from "lucide-react";
import EchoBubble from "./eco/EchoBubble";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, tag: "HOME" },
  { href: "/legal-guide", label: "Legal-Guide", icon: Scale, tag: "분석" },
  {
    href: "/legal-defense-draft",
    label: "Legal-Defense-Draft",
    icon: FilePenLine,
    tag: "방어",
  },
  {
    href: "/stories",
    label: "Ethics-Drama",
    icon: BookOpen,
    tag: "스토리",
  },
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

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-white/5 bg-navy-900/60 px-4 py-6 backdrop-blur-md md:flex">
      <Link
        href="https://lexguardai.vercel.app"
        aria-label="LexGuardAI Vercel 프로덕션 홈"
        className="group mb-8 flex items-center gap-3 rounded-xl px-2 py-1 transition-all hover:bg-white/[0.03]"
      >
        <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-500 sky-glow">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-black tracking-wide text-white">
            lexguardai.vercel.app
          </p>
          <p className="accent-text text-[11px]">AI 법률 방어 플랫폼 · v2.0</p>
        </div>
      </Link>

      <nav className="flex flex-col gap-1">
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
              className={`group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-all ${
                active
                  ? "bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-violet-500/15 text-white accent-border"
                  : "text-steel-300 hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={`h-4 w-4 ${
                    active ? "text-sky-300" : "text-steel-400"
                  }`}
                />
                <span className="font-semibold">{item.label}</span>
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
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

      {/* ── ECHO (동적 말풍선 + 클릭 → Live Chat) ─────────────── */}
      <div className="mt-auto">
        <EchoBubble />
        <div className="rounded-2xl glass p-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-sky-300" />
            <p className="text-[11px] font-bold text-white">AI Co-Pilot 가동 중</p>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-steel-400">
            국가법령 API · 실제 판례 학습 완료. 실시간 리스크% 분석 제공.
          </p>
        </div>
      </div>
    </aside>
  );
}
