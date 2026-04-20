"use client";

/**
 *  components/stories/DramaHeroTitle.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   Ethics-Drama 메인 임팩트 타이틀 — 10개 후보 중 페이지 진입 시 랜덤 선택.
 *   5초마다 부드럽게 다음 타이틀로 교체 (페이드).
 *   SSR-safe: 서버 렌더에서는 첫 번째 타이틀, 클라이언트 마운트 후 랜덤 시작.
 */

import { useEffect, useState } from "react";

const TITLES: Array<{ head: string; accent: string; tail?: string }> = [
  { head: "공직자의 운명을 가른", accent: "결정적 순간" },
  { head: "그날의 선택,", accent: "내일의 판결" },
  { head: "무심코 던진 청탁,", accent: "무겁게 돌아온 징계" },
  { head: "사소해 보였던 한 번이", accent: "경력을 지운 순간" },
  { head: "상사의 한 마디와", accent: "나의 인생을 맞바꾼 날" },
  { head: "문서 한 장이", accent: "10년을 증언한 법정" },
  { head: "선물 박스 안에 들어 있던", accent: "정직 3개월" },
  { head: "CCTV 3분 분량이", accent: "조용히 흘려보낸 진실" },
  { head: "가족의 부탁이", accent: "해임장을 부른 이유" },
  { head: "적극행정이라는 이름의", accent: "가장 강력한 방패", tail: "" },
];

export default function DramaHeroTitle() {
  // SSR 에서는 0번 고정 → hydration mismatch 방지
  const [idx, setIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    // 마운트 직후 랜덤 시작 (async to avoid sync setState in effect body)
    const kickoff = window.setTimeout(() => {
      setIdx(Math.floor(Math.random() * TITLES.length));
    }, 0);

    const rot = window.setInterval(() => {
      setFade(false);
      window.setTimeout(() => {
        setIdx((i) => (i + 1) % TITLES.length);
        setFade(true);
      }, 240);
    }, 5200);

    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(rot);
    };
  }, []);

  const t = TITLES[idx];

  return (
    <h2
      className={`mt-3 text-[26px] font-black leading-tight text-white transition-opacity duration-300 sm:text-3xl md:text-[40px] md:leading-[1.15] ${
        fade ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
    >
      <span>{t.head}</span> <br className="hidden md:block" />
      <span className="gradient-text">{t.accent}</span>
      {t.tail ? <span> {t.tail}</span> : null}
    </h2>
  );
}
