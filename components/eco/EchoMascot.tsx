"use client";

/**
 *  components/eco/EchoMascot.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   에코 마스코트 — SVG 기반 3D 느낌의 "살아있는" 로봇.
 *
 *   애니메이션:
 *     · body float (상하 부유)
 *     · eye blink (주기적으로 깜빡)
 *     · antenna signal pulse (주황 펄스)
 *     · 오른손 occasional wave (3초마다 짧게)
 *     · risk 모드: 돋보기가 눈 앞에서 좌우 스캔
 *
 *   SSR-safe: 시드/랜덤 없음. 순수 CSS keyframes 로만 구동.
 */

import { useEffect, useState } from "react";

type Props = {
  mood?: "welcome" | "safe" | "risk";
  size?: number; // px, 기본 120
  showBubble?: boolean;
  bubble?: string;
};

export default function EchoMascot({
  mood = "welcome",
  size = 120,
  showBubble = false,
  bubble,
}: Props) {
  // mount 시 '웨이브' 액션을 주기적으로 토글 (3초 주기, 0.6초간만 활성)
  const [waving, setWaving] = useState(false);
  useEffect(() => {
    const toggle = () => {
      setWaving(true);
      setTimeout(() => setWaving(false), 700);
    };
    const id = window.setInterval(toggle, 3400);
    toggle();
    return () => window.clearInterval(id);
  }, []);

  const dome =
    mood === "risk"
      ? { from: "#ff7a1a", to: "#c2410c" } // 주황 강조
      : mood === "safe"
        ? { from: "#34d399", to: "#0f766e" } // 에메랄드
        : { from: "#5b8bff", to: "#24417f" }; // 네이비-블루 (기본)

  const eye = mood === "risk" ? "#fff1d9" : mood === "safe" ? "#bbf7d0" : "#7fe3ff";

  return (
    <div
      className="relative select-none"
      style={{ width: size, height: size }}
      aria-label={`에코 — ${mood}`}
    >
      {/* 바닥 그림자 */}
      <div
        className="absolute inset-x-0 bottom-1 mx-auto h-2 rounded-full bg-black/40 blur-[6px]"
        style={{ width: size * 0.55, animation: "echo-shadow 3.2s ease-in-out infinite" }}
      />

      <svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        className="relative"
        style={{ animation: "echo-float 3.2s ease-in-out infinite" }}
      >
        <defs>
          <linearGradient id="eco-dome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={dome.from} />
            <stop offset="100%" stopColor={dome.to} />
          </linearGradient>
          <linearGradient id="eco-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4f7ff" />
            <stop offset="100%" stopColor="#b9c7e8" />
          </linearGradient>
          <radialGradient id="eco-visor" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor="#0a1226" />
            <stop offset="100%" stopColor="#04070f" />
          </radialGradient>
          <radialGradient id="eco-eye" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="40%" stopColor={eye} />
            <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.9" />
          </radialGradient>
        </defs>

        {/* ── 안테나 ─────────────────────────── */}
        <line
          x1="100"
          y1="22"
          x2="100"
          y2="42"
          stroke="#cfd8ff"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="100"
          cy="18"
          r="6"
          fill={dome.from}
          style={{ animation: "echo-antenna 1.6s ease-in-out infinite" }}
        />
        {/* 신호 퍼짐 */}
        <circle
          cx="100"
          cy="18"
          r="9"
          fill="none"
          stroke={dome.from}
          strokeWidth="2"
          opacity="0.5"
          style={{ animation: "echo-antenna-ring 1.6s ease-out infinite" }}
        />

        {/* ── 상단 돔(머리) ─────────────────── */}
        <path
          d="M50 88 Q50 42 100 42 Q150 42 150 88 Z"
          fill="url(#eco-dome)"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.2"
        />
        {/* 돔 하이라이트 */}
        <path
          d="M62 70 Q82 50 108 50"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />

        {/* ── 바이저(검은 얼굴판) ─────────── */}
        <rect
          x="56"
          y="68"
          width="88"
          height="34"
          rx="16"
          fill="url(#eco-visor)"
          stroke="rgba(120,180,255,0.35)"
          strokeWidth="1"
        />

        {/* 눈(2개) — blink 애니 */}
        <g style={{ animation: "echo-blink 4s ease-in-out infinite" }}>
          <circle cx="82" cy="86" r="7" fill="url(#eco-eye)" />
          <circle cx="118" cy="86" r="7" fill="url(#eco-eye)" />
          {/* 반짝 포인트 */}
          <circle cx="80" cy="83" r="1.6" fill="#ffffff" />
          <circle cx="116" cy="83" r="1.6" fill="#ffffff" />
        </g>

        {/* ── 몸통 ─────────────────────────── */}
        <rect
          x="62"
          y="104"
          width="76"
          height="58"
          rx="18"
          fill="url(#eco-body)"
          stroke="rgba(10,18,38,0.3)"
          strokeWidth="1"
        />
        {/* 가슴 라이트(숨쉬는 점) */}
        <circle
          cx="100"
          cy="134"
          r="6"
          fill={dome.from}
          style={{ animation: "echo-chest 2.4s ease-in-out infinite" }}
        />
        <circle
          cx="100"
          cy="134"
          r="10"
          fill="none"
          stroke={dome.from}
          strokeWidth="1.2"
          opacity="0.45"
          style={{ animation: "echo-chest-ring 2.4s ease-out infinite" }}
        />

        {/* ── 왼팔 ─────────────────────────── */}
        <g style={{ transformOrigin: "58px 116px" }}>
          <ellipse
            cx="50"
            cy="128"
            rx="10"
            ry="16"
            fill="url(#eco-body)"
            stroke="rgba(10,18,38,0.3)"
            strokeWidth="1"
          />
        </g>

        {/* ── 오른팔 (인사) ────────────────── */}
        <g
          style={{
            transformOrigin: "144px 116px",
            animation: waving
              ? "echo-wave 0.7s ease-in-out"
              : "none",
          }}
        >
          <ellipse
            cx="150"
            cy="128"
            rx="10"
            ry="16"
            fill="url(#eco-body)"
            stroke="rgba(10,18,38,0.3)"
            strokeWidth="1"
          />
          {/* 손가락 끝 하이라이트 */}
          <circle cx="152" cy="114" r="3" fill={dome.from} opacity="0.8" />
        </g>

        {/* ── 다리(지지대) ─────────────────── */}
        <rect x="78" y="160" width="14" height="10" rx="3" fill="#8fa1c7" />
        <rect x="108" y="160" width="14" height="10" rx="3" fill="#8fa1c7" />

        {/* ── 돋보기 (risk 모드에서만) ─────── */}
        {mood === "risk" && (
          <g style={{ animation: "echo-scan 2s ease-in-out infinite" }}>
            <circle
              cx="60"
              cy="90"
              r="14"
              fill="rgba(255,255,255,0.15)"
              stroke="#ff7a1a"
              strokeWidth="3"
            />
            <line
              x1="50"
              y1="100"
              x2="40"
              y2="112"
              stroke="#ff7a1a"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>

      {showBubble && bubble && (
        <div className="absolute -top-2 left-full ml-2 max-w-[180px] rounded-lg border border-white/10 bg-navy-900/90 px-2.5 py-1.5 text-[11px] font-bold text-white backdrop-blur-sm">
          {bubble}
          <span className="absolute -left-1 top-3 h-2 w-2 rotate-45 border-b border-l border-white/10 bg-navy-900/90" />
        </div>
      )}
    </div>
  );
}
