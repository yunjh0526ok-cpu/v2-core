"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "lexguard_visited_v2";

type Card = {
  icon: string;
  title: string;
  desc: string;
  href: string;
  /** ?tab=judgment 등 URL 파라미터 */
  param?: string;
  /** ?prefill=... 자동 입력 텍스트 */
  prefill?: string;
};

const CARDS: Card[] = [
  {
    icon: "⚖️",
    title: "리스크 즉시 진단",
    desc: "받아도 되나요? 위법인가요? 바로 확인",
    href: "/legal-guide",
  },
  {
    icon: "📋",
    title: "판결문 심층분석",
    desc: "실제 처벌 사례 6섹션 상세 분석",
    href: "/legal-guide",
    param: "tab=judgment",
  },
  {
    icon: "📝",
    title: "서식·문서 자동 작성",
    desc: "신고서·소명서·확인서 AI 자동 완성",
    href: "/legal-defense-draft",
  },
  {
    icon: "🛡️",
    title: "신고 절차 안내",
    desc: "공익신고·갑질신고 보호받는 방법",
    href: "/legal-guide",
    prefill: "신고 절차와 신분보호 방법을 알려주세요",
  },
];

export default function WelcomeOnboarding() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [neverAgain, setNeverAgain] = useState(false);

  useEffect(() => {
    try {
      const visited = localStorage.getItem(STORAGE_KEY);
      if (!visited) setVisible(true);
    } catch {
      // localStorage unavailable (SSR/privacy mode) — don't show
    }
  }, []);

  function dismiss(neverShow: boolean) {
    try {
      if (neverShow) localStorage.setItem(STORAGE_KEY, "1");
    } catch { /* ignore */ }
    setVisible(false);
  }

  function handleCard(card: Card) {
    dismiss(neverAgain);
    const parts: string[] = [];
    if (card.param) parts.push(card.param);
    if (card.prefill)
      parts.push(`prefill=${encodeURIComponent(card.prefill)}`);
    const qs = parts.length > 0 ? `?${parts.join("&")}` : "";
    router.push(`${card.href}${qs}`);
  }

  function handleStart() {
    dismiss(neverAgain);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.78)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss(false);
      }}
    >
      <div
        className="relative mx-4 w-full max-w-lg rounded-2xl p-6 shadow-2xl"
        style={{
          background: "#0d1428",
          border: "1px solid rgba(0,200,200,0.22)",
          boxShadow: "0 32px 80px -20px rgba(0,200,200,0.18)",
        }}
      >
        {/* 닫기 */}
        <button
          type="button"
          onClick={() => dismiss(false)}
          className="absolute right-4 top-4 text-lg leading-none text-steel-400 hover:text-white"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* 헤더 */}
        <p
          className="text-[11px] font-black uppercase tracking-widest"
          style={{ color: "#00c8c8" }}
        >
          LexGuard AI
        </p>
        <h2 className="mt-1 text-xl font-black leading-snug text-white">
          무엇을 도와드릴까요?
        </h2>
        <p className="mt-1 text-xs text-steel-400">
          원하시는 항목을 선택하시면 바로 시작됩니다
        </p>

        {/* 카드 4개 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => handleCard(card)}
              className="group rounded-xl p-4 text-left transition-all"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
              onMouseEnter={(e) => {
                const t = e.currentTarget;
                t.style.background = "rgba(0,200,200,0.08)";
                t.style.border = "1px solid rgba(0,200,200,0.45)";
              }}
              onMouseLeave={(e) => {
                const t = e.currentTarget;
                t.style.background = "rgba(255,255,255,0.03)";
                t.style.border = "1px solid rgba(255,255,255,0.09)";
              }}
            >
              <span className="text-2xl">{card.icon}</span>
              <p
                className="mt-2 text-sm font-black text-white transition-colors group-hover:text-[#00e0e0]"
              >
                {card.title}
              </p>
              <p className="mt-0.5 text-[11px] text-steel-400 group-hover:text-steel-300">
                {card.desc}
              </p>
            </button>
          ))}
        </div>

        {/* 하단 */}
        <div className="mt-5 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-steel-400">
            <input
              type="checkbox"
              checked={neverAgain}
              onChange={(e) => setNeverAgain(e.target.checked)}
              className="h-3.5 w-3.5"
              style={{ accentColor: "#00c8c8" }}
            />
            다시 보지 않기
          </label>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-lg px-4 py-2 text-sm font-black text-white transition-opacity hover:opacity-85"
            style={{ background: "linear-gradient(to right,#00c8c8,#0088ff)" }}
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
