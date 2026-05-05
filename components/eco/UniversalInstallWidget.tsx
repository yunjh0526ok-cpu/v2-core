"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import PwaInstallPrompt from "@/components/eco/PwaInstallPrompt";

type Platform = "android" | "ios" | "desktop" | "installed" | "unknown";

function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent;
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

const DISMISS_UNTIL_KEY = "lexguard_pwa_install_dismiss_until_v2";
const CYCLE_KEY = "lexguard_pwa_install_cycle_days_v1";
const DEFAULT_DAYS = 7;

function getCycleDays(): number {
  try {
    const raw = window.localStorage.getItem(CYCLE_KEY);
    const n = raw ? Number(raw) : DEFAULT_DAYS;
    if (n === 3 || n === 7 || n === 14) return n;
  } catch {
    // noop
  }
  return DEFAULT_DAYS;
}

export default function UniversalInstallWidget() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    try {
      // 이전 버전(영구 숨김 key) 마이그레이션
      const legacy = window.localStorage.getItem("lexguard_pwa_install_dismissed_v1");
      if (legacy === "1") {
        const until = Date.now() + getCycleDays() * 24 * 60 * 60 * 1000;
        window.localStorage.setItem(DISMISS_UNTIL_KEY, String(until));
        window.localStorage.removeItem("lexguard_pwa_install_dismissed_v1");
      }

      const untilRaw = window.localStorage.getItem(DISMISS_UNTIL_KEY);
      const until = untilRaw ? Number(untilRaw) : 0;
      if (Number.isFinite(until) && until > Date.now()) {
        setDismissed(true);
      } else {
        setDismissed(false);
        if (untilRaw) window.localStorage.removeItem(DISMISS_UNTIL_KEY);
      }
    } catch {
      // noop
    }
  }, []);

  const installable = useMemo(() => platform !== "installed", [platform]);

  useEffect(() => {
    if (!dismissed && installable) {
      setOpen(true);
    }
  }, [dismissed, installable]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ open?: boolean }>;
      setChatOpen(Boolean(ce.detail?.open));
    };
    window.addEventListener("eco:state", handler as EventListener);
    return () =>
      window.removeEventListener("eco:state", handler as EventListener);
  }, []);

  if (!installable) return null;

  const dismissAll = () => {
    setOpen(false);
    setDismissed(true);
    try {
      const ms = getCycleDays() * 24 * 60 * 60 * 1000;
      window.localStorage.setItem(
        DISMISS_UNTIL_KEY,
        String(Date.now() + ms)
      );
    } catch {
      // noop
    }
  };

  return (
    <div
      className={`pointer-events-none fixed z-[95] transition-all duration-200 ${
        chatOpen
          ? "hidden md:block md:bottom-6 md:right-[420px]"
          : "bottom-20 left-3 right-3 md:bottom-6 md:left-auto md:right-6"
      }`}
    >
      {open ? (
        <div className="pointer-events-auto ml-auto w-[min(92vw,360px)] rounded-2xl border border-white/10 bg-navy-950/95 p-2 shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between px-2 pt-1">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-200">
              앱 설치
            </p>
            <button
              type="button"
              onClick={dismissAll}
              className="rounded-lg p-1 text-steel-400 hover:text-white"
              aria-label="설치 위젯 닫기"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <PwaInstallPrompt onDismiss={dismissAll} />
        </div>
      ) : (
        !dismissed && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-sky-300/35 bg-sky-500/15 px-4 py-2 text-xs font-black text-sky-100 shadow-lg hover:bg-sky-500/25"
          >
            <Download className="h-3.5 w-3.5" />
            앱 설치
          </button>
        )
      )}
    </div>
  );
}
