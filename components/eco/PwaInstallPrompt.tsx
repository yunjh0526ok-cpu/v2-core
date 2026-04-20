"use client";

/**
 * PwaInstallPrompt
 * ─────────────────────────────────────────────────────────────
 * Android/Chrome  → beforeinstallprompt 이벤트 캡처 → "설치" 버튼 클릭 시 prompt()
 * iOS Safari      → 수동 안내 (공유 버튼 → 홈 화면에 추가)
 * 이미 설치됨     → 숨김
 * ─────────────────────────────────────────────────────────────
 * 사용법: EchoFloatingChat 또는 EchoBubble 안에서 <PwaInstallPrompt /> 렌더
 */

import { useEffect, useState } from "react";
import { Download, Share, X, Smartphone, Monitor } from "lucide-react";

type Platform = "android" | "ios" | "desktop" | "installed" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
  // 이미 standalone 모드(설치됨)
  if (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  ) {
    return "installed";
  }
  if (/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

interface Props {
  /** 팝업 닫기 콜백 (부모에서 상태 제어) */
  onDismiss: () => void;
}

export default function PwaInstallPrompt({ onDismiss }: Props) {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [installing, setInstalling] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstalling(false);
    if (outcome === "accepted") {
      setDone(true);
      setTimeout(onDismiss, 1800);
    }
    setDeferredPrompt(null);
  };

  // 설치 완료 상태
  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-center">
        <p className="text-2xl">🎉</p>
        <p className="mt-1 text-[13px] font-black text-emerald-200">
          LexGuard 앱 설치 완료!
        </p>
        <p className="mt-0.5 text-[11px] text-emerald-300/80">
          홈 화면에서 바로 실행하세요.
        </p>
      </div>
    );
  }

  // Android / Desktop — beforeinstallprompt 가 있을 때
  if ((platform === "android" || platform === "desktop") && deferredPrompt) {
    return (
      <div className="rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {platform === "android" ? (
              <Smartphone className="h-5 w-5 shrink-0 text-sky-300" />
            ) : (
              <Monitor className="h-5 w-5 shrink-0 text-sky-300" />
            )}
            <div>
              <p className="text-[13px] font-black text-white">
                LexGuard 앱으로 설치
              </p>
              <p className="text-[11px] text-steel-300">
                {platform === "android"
                  ? "홈 화면에 추가해 오프라인에서도 빠르게 실행"
                  : "PC 바탕화면에 앱처럼 설치 — 빠른 실행"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-steel-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={handleInstall}
          disabled={installing}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 py-2.5 text-[13px] font-black text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {installing ? "설치 중..." : "지금 설치하기"}
        </button>
      </div>
    );
  }

  // iOS Safari — 수동 안내
  if (platform === "ios") {
    return (
      <div className="rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-500/10 to-violet-500/10 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 shrink-0 text-sky-300" />
            <p className="text-[13px] font-black text-white">
              홈 화면에 LexGuard 추가
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-steel-400 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <ol className="mt-3 space-y-2">
          {[
            { icon: <Share className="h-4 w-4 text-sky-300" />, text: "Safari 하단 공유(□↑) 버튼 탭" },
            { icon: <span className="text-[14px]">➕</span>, text: "'홈 화면에 추가' 선택" },
            { icon: <span className="text-[14px]">✅</span>, text: "'추가' 누르면 완료!" },
          ].map((step, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-sky-500/20 text-[11px] font-black text-sky-200">
                {i + 1}
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-steel-100">
                {step.icon} {step.text}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-center text-[10.5px] text-steel-400">
          설치 후 홈 화면의 LexGuard 아이콘으로 바로 실행됩니다.
        </p>
      </div>
    );
  }

  // Desktop — beforeinstallprompt 없음 (이미 설치 or 미지원)
  if (platform === "installed") {
    return (
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 p-3 text-center text-[12px] text-emerald-300">
        ✅ LexGuard가 이미 설치되어 있습니다.
      </div>
    );
  }

  // 대기 중 (이벤트 아직 미발생 / 비지원 브라우저)
  return (
    <div className="rounded-2xl border border-sky-300/20 bg-sky-500/5 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-black text-white">LexGuard 앱 설치</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-steel-300">
            Chrome 브라우저에서 주소창 오른쪽{" "}
            <span className="font-bold text-sky-200">⊕ 설치</span> 아이콘을
            클릭하거나, 메뉴 → <span className="font-bold text-sky-200">앱 설치</span>를
            선택하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-1 text-steel-400 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
