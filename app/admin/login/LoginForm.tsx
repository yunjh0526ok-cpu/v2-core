"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

export default function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(
          json?.message ??
            (json?.error === "INVALID_CREDENTIALS"
              ? `비밀번호가 틀렸습니다. (남은 시도 ${json.remaining}회)`
              : "로그인 실패")
        );
        return;
      }
      router.replace(redirectTo || "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "네트워크 오류");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="glass-strong w-full max-w-md rounded-3xl p-8"
      >
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-navy-700 to-orange-550 orange-glow">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-white">관리자 로그인</p>
            <p className="text-[11px] text-steel-300">
              Ethics-Core AI 2.0 · Admin Console
            </p>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[11px] font-bold text-orange-300">
            관리자 비밀번호
          </span>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-navy-900/70 px-3 py-2.5 focus-within:border-orange-400/60">
            <Lock className="h-4 w-4 text-orange-400" />
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-steel-500 outline-none"
              autoFocus
            />
          </div>
        </label>

        {error && (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || password.length === 0}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-navy-700 to-orange-550 px-4 py-3 text-sm font-black text-white orange-glow disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              검증 중…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              로그인
            </>
          )}
        </button>

        <p className="mt-5 text-[10px] leading-relaxed text-steel-400">
          비밀번호는 서버 환경변수(<code className="font-mono">ADMIN_PASSWORD</code>)
          로만 저장되며, 이 화면을 통해서만 세션 쿠키가 발급됩니다. 소스코드에
          비밀번호가 포함되지 않으며 Git 에도 커밋되지 않습니다.
        </p>
      </form>
    </div>
  );
}
