"use client";

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useState } from "react";
import { Lock, SlidersHorizontal, X } from "lucide-react";

const CYCLE_KEY = "lexguard_pwa_install_cycle_days_v1";
const ADMIN_UNLOCK_KEY = "lexguard_admin_cycle_setting_unlocked_v1";
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_INSTALL_SETTING_ADMIN_PASSWORD ?? "lexguard-admin";
const OPTIONS = [3, 7, 14] as const;

export default function InstallCycleSetting() {
  const [days, setDays] = useState<3 | 7 | 14>(7);
  const [unlocked, setUnlocked] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CYCLE_KEY);
      const n = raw ? Number(raw) : 7;
      if (n === 3 || n === 7 || n === 14) setDays(n);
      setUnlocked(window.localStorage.getItem(ADMIN_UNLOCK_KEY) === "1");
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setShowGate(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const update = (v: 3 | 7 | 14) => {
    setDays(v);
    try {
      window.localStorage.setItem(CYCLE_KEY, String(v));
    } catch {
      // noop
    }
  };

  const unlock = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setUnlocked(true);
      setShowGate(false);
      setPassword("");
      setError("");
      try {
        window.localStorage.setItem(ADMIN_UNLOCK_KEY, "1");
      } catch {
        // noop
      }
      return;
    }
    setError("비밀번호가 일치하지 않습니다.");
  };

  const lock = () => {
    setUnlocked(false);
    try {
      window.localStorage.removeItem(ADMIN_UNLOCK_KEY);
    } catch {
      // noop
    }
  };

  const onPasswordEnter = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
    }
  };

  if (!unlocked && !showGate) return null;

  return (
    <>
      {showGate && !unlocked && (
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-sky-300/30 bg-navy-950/90 p-4 text-left">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-black text-sky-100">
              <Lock className="h-4 w-4" />
              관리자 인증
            </p>
            <button
              type="button"
              onClick={() => setShowGate(false)}
              className="rounded-md p-1 text-steel-400 hover:text-white"
              aria-label="관리자 인증 닫기"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <form onSubmit={unlock} className="space-y-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onPasswordEnter}
              className="w-full rounded-lg border border-white/20 bg-navy-900/70 px-3 py-2 text-sm text-white outline-none focus:border-sky-300/60"
              placeholder="관리자 비밀번호"
            />
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            <button
              type="submit"
              className="w-full rounded-lg bg-sky-500/80 px-3 py-2 text-sm font-black text-white hover:bg-sky-500"
            >
              인증 후 설정 열기
            </button>
          </form>
          <p className="mt-2 text-[11px] text-steel-400">
            관리자 단축키: Ctrl + Alt + L
          </p>
        </div>
      )}

      {unlocked ? (
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-sky-300/25 bg-sky-500/10 p-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[0.14em] text-sky-200">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              설치 배너 재노출 주기 (관리자)
            </div>
            <button
              type="button"
              onClick={lock}
              className="rounded-md border border-white/20 px-2 py-1 text-[11px] font-black text-steel-300 hover:border-sky-300/40 hover:text-sky-100"
            >
              잠금
            </button>
          </div>
          <p className="mt-1 text-xs text-steel-300">
            첫 방문 1회 노출 후 닫으면 선택한 주기 뒤 다시 노출됩니다.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {OPTIONS.map((opt) => {
              const active = days === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => update(opt)}
                  className={`rounded-full border px-3 py-1 text-xs font-black transition ${
                    active
                      ? "border-sky-300/60 bg-sky-500/20 text-sky-100"
                      : "border-white/15 bg-navy-900/50 text-steel-300 hover:border-sky-300/40 hover:text-sky-100"
                  }`}
                >
                  {opt}일
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
