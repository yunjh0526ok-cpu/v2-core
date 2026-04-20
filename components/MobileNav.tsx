"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Scale,
  MessagesSquare,
  BarChart3,
  ClipboardCheck,
  BookOpen,
} from "lucide-react";

const TABS = [
  { href: "/", label: "홈", icon: LayoutDashboard },
  { href: "/legal-guide", label: "Legal", icon: Scale },
  { href: "/stories", label: "Drama", icon: BookOpen },
  { href: "/dialogue", label: "Dialogue", icon: MessagesSquare },
  { href: "/intelligence-hub", label: "Hub", icon: BarChart3 },
  { href: "/apply", label: "신청", icon: ClipboardCheck },
];

export default function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-navy-950/90 backdrop-blur-xl">
      <ul className="mx-auto grid max-w-[640px] grid-cols-6">
        {TABS.map((t) => {
          const active =
            t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold break-keep transition-all ${
                  active
                    ? "text-sky-200 [text-shadow:_0_0_12px_rgb(125_211_252_/_0.45)]"
                    : "text-steel-400 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
