"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "lexguard_visited";

type Card = {
  icon: string;
  title: string;
  desc: string;
  href: string;
  tab?: string;
};

const CARDS: Card[] = [
  {
    icon: "⚖️",
    title: "법률 상담이 필요해요",
    desc: "법령·판례·리스크 즉시 분석",
    href: "/legal-guide",
  },
  {
    icon: "📄",
    title: "소명서·답변서를 써야 해요",
    desc: "AI 대화로 문서 자동 생성",
    href: "/legal-defense-draft",
  },
  {
    icon: "🔍",
    title: "유사 판례를 찾고 싶어요",
    desc: "대법원 판례 3건 즉시 매칭",
    href: "/legal-defense-draft",
    tab: "precedent",
  },
  {
    icon: "🛡️",
    title: "부패·갑질 신고하고 싶어요",
    desc: "신고 절차·보호 범위 안내",
    href: "/legal-guide",
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
    if (card.tab) {
      router.push(`${card.href}?tab=${encodeURIComponent(card.tab)}`);
    } else {
      router.push(card.href);
    }
  }

  function handleStart() {
    dismiss(neverAgain);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) dismiss(false); }}
    >
      <div
        className="relative mx-4 w-full max-w-lg rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{ background: "#0f1117" }}
      >
        {/* 닫기 버튼 */}
        <button
          type="button"
          onClick={() => dismiss(false)}
          className="absolute right-4 top-4 text-steel-400 hover:text-white text-lg leading-none"
          aria-label="닫기"
        >
          ✕
        </button>

        {/* 헤더 */}
        <p className="text-[11px] font-black uppercase tracking-widest text-sky-400">
          LexGuard AI
        </p>
        <h2 className="mt-1 text-xl font-black text-white leading-snug">
          렉스가드 AI로 무엇을 도와드릴까요?
        </h2>
        <p className="mt-1 text-xs text-steel-400">
          원하시는 것을 선택하시면 바로 시작됩니다
        </p>

        {/* 카드 4개 */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {CARDS.map((card) => (
            <button
              key={card.title}
              type="button"
              onClick={() => handleCard(card)}
              className="group rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-sky-400/50 hover:bg-sky-500/10"
            >
              <span className="text-2xl">{card.icon}</span>
              <p className="mt-2 text-sm font-black text-white group-hover:text-sky-200">
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
              className="h-3.5 w-3.5 accent-sky-500"
            />
            다시 보지 않기
          </label>
          <button
            type="button"
            onClick={handleStart}
            className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-black text-white"
          >
            시작하기
          </button>
        </div>
      </div>
    </div>
  );
}
