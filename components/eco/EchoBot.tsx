"use client";

/**
 *  components/eco/EchoBot.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   에코(Echo) — 공직자 AI 청렴 파트너 마스코트
 *
 *   · 시간대별 인사말 랜덤 노출 (날짜 시드 고정 → 같은 날 동일 문구)
 *   · 타이핑(Typewriter) 애니메이션
 *   · risk prop: "safe" → 엄지척(👍)  /  "risk" → 돋보기(🔍) 마이크로 애니
 *
 *   SSR-safe: 서버/클라이언트 동일 시드 사용 → hydration mismatch 없음.
 */

import { useEffect, useMemo, useState } from "react";
import { Sparkles, ShieldCheck, Handshake, ScanSearch } from "lucide-react";
import { getEchoLine, type EchoLine } from "@/lib/echo";

type Props = {
  risk?: "safe" | "risk" | null;
  /** 사용자 이름 주입 (기본값: "담당자님") */
  userName?: string;
  className?: string;
};

export default function EchoBot({ risk = null, userName, className }: Props) {
  const line: EchoLine = useMemo(() => getEchoLine({ risk }), [risk]);

  // 이름이 지정되면 "담당자님" → 해당 이름으로 치환
  const baseText = useMemo(
    () =>
      userName && userName.trim()
        ? line.text.replace(/담당자님|선생님/g, userName.trim())
        : line.text,
    [line.text, userName]
  );

  const typed = useTypewriter(baseText, 22);

  const moodTone =
    line.mood === "risk"
      ? "from-rose-500/25 via-orange-500/10 to-transparent"
      : line.mood === "safe"
        ? "from-emerald-500/25 via-orange-500/10 to-transparent"
        : "from-orange-500/20 via-navy-700/30 to-transparent";

  return (
    <div
      className={`relative flex items-start gap-3 md:gap-4 ${className ?? ""}`}
    >
      {/* ── Avatar ───────────────────────────────────────────────── */}
      <div className="relative shrink-0">
        <div
          className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${moodTone} ring-1 ring-white/10 md:h-16 md:w-16`}
          aria-hidden
        >
          <EchoFace mood={line.mood} icon={line.icon} />
        </div>
        {/* 숨쉬는 점 (online indicator) */}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-navy-950 ring-2 ring-navy-900">
          <span
            className={`h-2 w-2 rounded-full ${
              line.mood === "risk"
                ? "bg-rose-400"
                : line.mood === "safe"
                  ? "bg-emerald-400"
                  : "bg-orange-400"
            } animate-pulse`}
          />
        </span>
      </div>

      {/* ── Speech bubble ────────────────────────────────────────── */}
      <div className="relative flex-1 min-w-0">
        {/* bubble tail */}
        <span className="absolute -left-2 top-4 hidden h-3 w-3 rotate-45 rounded-sm border-l border-t border-white/10 bg-navy-900/70 md:block" />

        <div className="glass rounded-2xl border border-white/10 px-4 py-3 md:px-5 md:py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">
              ECHO · AI 청렴 파트너
            </p>
            <MoodChip mood={line.mood} />
            <span className="ml-auto hidden text-[10px] text-steel-400 md:inline">
              신뢰 · 공정 · 안심
            </span>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-steel-100 md:text-sm">
            {typed}
            <Caret />
          </p>
          <p className="mt-1.5 text-[11px] font-bold text-steel-300">
            — {line.tagline}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Typewriter hook
 * ═══════════════════════════════════════════════════════════════════ */

function useTypewriter(full: string, speedMs = 24): string {
  const [shown, setShown] = useState("");
  useEffect(() => {
    let i = 0;
    let id: number | null = null;
    let cancelled = false;
    // Reset asynchronously to avoid synchronous setState in effect body
    const reset = window.setTimeout(() => {
      if (cancelled) return;
      setShown("");
      if (!full) return;
      id = window.setInterval(() => {
        i++;
        setShown(full.slice(0, i));
        if (i >= full.length && id !== null) window.clearInterval(id);
      }, speedMs);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(reset);
      if (id !== null) window.clearInterval(id);
    };
  }, [full, speedMs]);
  return shown;
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-orange-300"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Echo face — 상태별 마이크로 애니메이션
 *   safe    → 엄지척 (Handshake 대체: 👍 이모지)  + bounce
 *   risk    → 돋보기(ScanSearch) + 진지하게 흔들림 (shake)
 *   welcome → 기본 ShieldCheck + soft bob
 * ═══════════════════════════════════════════════════════════════════ */

function EchoFace({
  mood,
  icon,
}: {
  mood: "default" | "safe" | "risk" | "welcome";
  icon: string;
}) {
  if (mood === "safe") {
    return (
      <span
        className="text-2xl md:text-3xl"
        style={{ animation: "echo-bounce 1.6s ease-in-out infinite" }}
        aria-label="안전 — 엄지척"
      >
        👍
      </span>
    );
  }
  if (mood === "risk") {
    return (
      <span
        className="text-2xl md:text-3xl"
        style={{ animation: "echo-shake 1.1s ease-in-out infinite" }}
        aria-label="위험 — 돋보기"
      >
        🔍
      </span>
    );
  }
  // welcome / default
  return (
    <div
      className="relative grid place-items-center"
      style={{ animation: "echo-float 3.2s ease-in-out infinite" }}
    >
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-navy-700 to-orange-550/80 orange-glow md:h-12 md:w-12">
        <ShieldCheck className="h-5 w-5 text-white md:h-6 md:w-6" />
      </div>
      <span className="absolute -right-1 -top-1 text-base">{icon}</span>
    </div>
  );
}

function MoodChip({ mood }: { mood: "default" | "safe" | "risk" | "welcome" }) {
  if (mood === "risk") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-black text-rose-200">
        <ScanSearch className="h-3 w-3" />
        리스크 감지
      </span>
    );
  }
  if (mood === "safe") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black text-emerald-200">
        <Handshake className="h-3 w-3" />
        안심 확인
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[10px] font-black text-orange-200">
      <Sparkles className="h-3 w-3" />
      파트너 모드
    </span>
  );
}
