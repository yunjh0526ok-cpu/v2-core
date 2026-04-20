"use client";

/**
 *  components/eco/DailyQuoteBanner.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   하단 띠배너: "오늘의 청렴 명언 — 에코가 매일 하나씩 배달합니다."
 *   · 날짜 시드로 매일 1개 자동 선택 (KST)
 *   · 데스크톱: 얇은 띠(sticky footer 위)   /   모바일: MobileNav 위에 떠 있음
 */

import { useMemo } from "react";
import { Quote, Sparkles } from "lucide-react";
import { dailyQuote } from "@/lib/echo";

export default function DailyQuoteBanner() {
  const q = useMemo(() => dailyQuote(), []);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[68px] z-20 px-3 md:bottom-0 md:px-6"
      aria-label="오늘의 청렴 명언"
    >
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-center">
        <div className="pointer-events-auto flex w-full items-center gap-2 overflow-hidden rounded-t-xl border border-orange-400/25 bg-gradient-to-r from-navy-900/95 via-navy-850/95 to-navy-900/95 px-3 py-1.5 text-[11px] text-steel-200 backdrop-blur-md md:rounded-xl md:px-4 md:py-2 md:text-xs">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500/15 px-1.5 py-0.5 font-black text-orange-300">
            <Sparkles className="h-3 w-3" />
            오늘의 청렴
          </span>
          <span className="hidden shrink-0 text-steel-400 md:inline">│</span>
          <Quote className="hidden h-3 w-3 shrink-0 text-orange-300 md:block" />
          <p className="truncate font-bold text-white">{q.text}</p>
          {q.author && (
            <span className="ml-auto hidden shrink-0 text-[11px] font-bold text-steel-300 md:inline">
              — {q.author}
            </span>
          )}
          <span className="ml-auto shrink-0 text-[10px] font-bold text-steel-400 md:ml-2">
            by Echo
          </span>
        </div>
      </div>
    </div>
  );
}
