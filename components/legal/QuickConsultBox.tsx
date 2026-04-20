"use client";

/**
 *  components/legal/QuickConsultBox.tsx
 *  ────────────────────────────────────
 *   Dashboard "부패방지 + 적극행정" 듀얼 축 바로 아래 배치되는
 *   [빠른 상담 박스]. 짧은 질문을 입력하면 곧바로 Legal-Guide 로
 *   이동하여 AI 분석이 자동 시작됩니다. (URL ?q= 파라미터)
 *
 *   색 톤: 스카이 · 바이올렛 그라데이션 (오렌지 제거)
 */

import { useRouter } from "next/navigation";
import { useState, FormEvent } from "react";
import { Send, Scale, Sparkles, ArrowUpRight } from "lucide-react";

const SUGGESTIONS = [
  "명절 민원인 상품권 5만원",
  "배우자 업체 계약 진행",
  "적극행정 면책 신청",
  "부당지시 거부 시 보호",
];

export default function QuickConsultBox() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const text = q.trim();
    if (!text) return;
    router.push(`/legal-guide?q=${encodeURIComponent(text)}`);
  };

  const send = (s: string) => {
    router.push(`/legal-guide?q=${encodeURIComponent(s)}`);
  };

  return (
    <section
      aria-label="빠른 상담 박스"
      className="gradient-border relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900/80 via-navy-800/60 to-navy-900/80 p-5 md:p-6"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" />

      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">Quick Legal Consult · 빠른 상담</span>
          </p>
          <h3 className="mt-2 text-2xl font-black leading-tight text-white md:text-[28px]">
            지금 고민 중인 <span className="gradient-text">한 줄</span>을 적어주세요.
          </h3>
          <p className="mt-1.5 text-[14.5px] font-semibold leading-relaxed text-white/80 md:text-[15.5px]">
            국가법령 API + AI 가 <span className="accent-chip">근거 조문</span>과{" "}
            <span className="accent-chip">리스크%</span>를 10초 안에 돌려드립니다.
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-sky-300/40 bg-sky-500/10 px-3 py-1.5 text-[12px] font-black text-sky-200 md:self-auto">
          <Sparkles className="h-3.5 w-3.5" />
          Gemini + 국가법령 API
        </span>
      </div>

      <form
        onSubmit={submit}
        className="relative mt-5 flex flex-col gap-2 sm:flex-row"
      >
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-sky-300/30 bg-navy-950/70 px-4 py-3 focus-within:border-sky-300/70">
          <Scale className="h-5 w-5 shrink-0 text-sky-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="예: 상급자가 부당한 계약 변경을 지시했는데 거부해도 되나요?"
            className="w-full bg-transparent text-[16px] font-semibold text-white placeholder:text-steel-400 outline-none"
            maxLength={200}
          />
        </div>
        <button
          type="submit"
          disabled={!q.trim()}
          className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-6 py-3.5 text-[15px] font-black text-white sky-glow transition-all hover:scale-[1.02] disabled:opacity-40"
        >
          <Send className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          AI 분석 시작
        </button>
      </form>

      {/* 퀵 서제스트 */}
      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <p className="text-[11.5px] font-black uppercase tracking-widest text-steel-300">
          자주 묻는 상황
        </p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => send(s)}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[13px] font-bold text-white/85 transition-all hover:-translate-y-0.5 hover:border-sky-300/50 hover:bg-sky-500/10 hover:text-sky-100"
          >
            {s}
            <ArrowUpRight className="h-3 w-3" />
          </button>
        ))}
      </div>
    </section>
  );
}
