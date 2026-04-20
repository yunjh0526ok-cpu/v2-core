"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Sparkles, Download } from "lucide-react";
import EchoMascot from "./EchoMascot";
import PwaInstallPrompt from "./PwaInstallPrompt";

/**
 *  EchoBubble — 사이드바 로봇 위의 '동적 말풍선'.
 *  - 3개의 신뢰 기반 메시지를 타이핑 애니메이션으로 로테이션
 *  - 반투명 검정 + 스카이블루 그라데이션 포인트
 *  - 말풍선이 사이드바 밖으로 삐져나가지 않도록 폭을 사이드바 내부에 맞춤
 *  - 말풍선 / 로봇 어디를 눌러도 window 'eco:open' 이벤트 dispatch → FloatingChat 오픈
 */

const LINES: { accent: string; body: string }[] = [
  {
    accent: "반갑습니다, 담당자님",
    body: "국가법령정보 API + 17,902건의 실전 판례로 가장 정확한 법적 팩트를 분석해 드립니다.",
  },
  {
    accent: "추측이 아닌 재판 기록",
    body: "징계 데이터 기반으로 답합니다. 지금 고민 중인 사례의 실전 대응법을 확인하세요.",
  },
  {
    accent: "청렴·적극행정의 든든한 방패",
    body: "에코입니다. 법령 근거에 기반한 리스크 진단을 지금 바로 시작할까요?",
  },
];

const TYPE_SPEED_MS = 28;
const HOLD_MS = 3600;
const FADE_MS = 220;

function useTypewriterRotation(lines: typeof LINES) {
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const runCycle = (i: number) => {
      if (cancelled) return;
      const fullBody = lines[i].body;
      setTyped("");
      setVisible(true);

      let ch = 0;
      const typer = window.setInterval(() => {
        if (cancelled) return;
        ch++;
        setTyped(fullBody.slice(0, ch));
        if (ch >= fullBody.length) {
          window.clearInterval(typer);
          const holdId = window.setTimeout(() => {
            if (cancelled) return;
            setVisible(false);
            const nextId = window.setTimeout(() => {
              if (cancelled) return;
              setIdx((p) => (p + 1) % lines.length);
            }, FADE_MS);
            timers.push(nextId);
          }, HOLD_MS);
          timers.push(holdId);
        }
      }, TYPE_SPEED_MS);
      timers.push(typer as unknown as number);
    };

    const kickoff = window.setTimeout(() => runCycle(idx), 40);
    timers.push(kickoff);

    return () => {
      cancelled = true;
      timers.forEach((t) => {
        window.clearInterval(t);
        window.clearTimeout(t);
      });
    };
  }, [idx, lines]);

  return { line: lines[idx], typed, visible };
}

export default function EchoBubble() {
  const { line, typed, visible } = useTypewriterRotation(LINES);
  const [showInstall, setShowInstall] = useState(false);

  const open = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("eco:open"));
  };

  return (
    <div className="relative mb-3 w-full">
      {/* ── 말풍선 · 로봇 '바로 위' 에 온전히 표시 ─────────────
          사이드바 w-[260px], 좌우 패딩 16px → 가용폭 228px
          말풍선을 w-full 로 잡고 내부 여백을 넉넉히 */}
      <div
        className={`mb-2 w-full transition-opacity duration-200 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ animation: "eco-bubble-float 3.6s ease-in-out infinite" }}
      >
        <button
          type="button"
          onClick={open}
          aria-label="에코 실시간 상담창 열기"
          className="group relative block w-full rounded-2xl border border-sky-300/25 bg-black/70 px-3.5 py-3 text-left shadow-2xl backdrop-blur-md transition-all hover:border-sky-300/55 hover:shadow-[0_0_40px_-8px_rgba(125,211,252,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
        >
          {/* 우상단 라이브 점등 */}
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1">
            <span className="relative h-2 w-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/70" />
              <span className="absolute inset-0 rounded-full bg-sky-300" />
            </span>
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-200">
              LIVE
            </span>
          </span>

          <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.16em]">
            <Sparkles className="h-3 w-3 text-sky-300" />
            <span className="accent-text">{line.accent}</span>
          </p>
          <p
            className="mt-1.5 whitespace-normal text-[12.5px] font-semibold leading-[1.55] text-white"
            style={{ wordBreak: "keep-all", overflowWrap: "anywhere" }}
          >
            {typed}
            <span
              aria-hidden
              className="ml-0.5 inline-block h-3 w-[2px] translate-y-[2px] animate-pulse bg-sky-300"
            />
          </p>
          {/* 말풍선 꼬리 — 마스코트 중앙 위를 가리키게 */}
          <span
            aria-hidden
            className="absolute left-1/2 top-full -translate-x-1/2 h-0 w-0 border-x-[9px] border-t-[10px] border-x-transparent border-t-black/70"
          />
        </button>
      </div>

      {/* ── 마스코트 + 라벨 (클릭 가능) ─────────────────────── */}
      <button
        type="button"
        onClick={open}
        aria-label="에코 실시간 상담창 열기"
        className="group relative flex w-full flex-col items-center overflow-visible rounded-2xl border border-sky-300/20 bg-gradient-to-b from-navy-800/90 via-navy-900/85 to-navy-950/95 px-2 pt-4 pb-2 transition-all hover:border-sky-300/50 hover:shadow-[0_0_50px_-12px_rgba(125,211,252,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
      >
        {/* 상단 sky/violet 그라데이션 글로우 */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-12 rounded-t-2xl bg-gradient-to-b from-sky-400/15 via-indigo-400/10 to-transparent" />
        {/* 하단 violet 광원 */}
        <span className="pointer-events-none absolute inset-x-6 bottom-6 h-16 rounded-full bg-violet-400/20 blur-2xl" />

        {/* 캐릭터성 강화 — 더 크게, 보디 광원 */}
        <div className="relative">
          <EchoMascot size={170} mood="welcome" />
        </div>

        <div className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-300/40 bg-gradient-to-r from-sky-500/15 via-indigo-500/15 to-violet-500/15 px-3 py-2">
          <MessageCircle className="h-3.5 w-3.5 text-sky-300" />
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">
            <span className="accent-text">Echo · Live Chat 열기</span>
          </p>
        </div>
      </button>

      {/* 앱 설치 버튼 */}
      {!showInstall && (
        <button
          type="button"
          onClick={() => setShowInstall(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-[11px] font-bold text-violet-200 transition-all hover:bg-violet-500/20"
        >
          <Download className="h-3.5 w-3.5" />
          웹·앱 설치하기
        </button>
      )}

      {/* 설치 팝업 */}
      {showInstall && (
        <div className="mt-2 w-full">
          <PwaInstallPrompt onDismiss={() => setShowInstall(false)} />
        </div>
      )}
    </div>
  );
}
