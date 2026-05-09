"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, X, MessageCircle, Loader2, Scale, Sparkles, Home, Download } from "lucide-react";
import Link from "next/link";
import EchoMascot from "./EchoMascot";
import PwaInstallPrompt from "./PwaInstallPrompt";
import { searchPrecedentsClient, precedentsToCitations } from "@/lib/law-api-client";

/**
 *  EchoFloatingChat — 우측 하단 고정 실시간 팩트 체크 상담창
 *  - window 'eco:open' 이벤트로 열림 (EchoBubble, 토글 버튼 모두 호출)
 *  - Gemini API(/api/eco/chat) 로 실시간 답변
 *  - 법령 관련 키워드 감지 시 Legal-Guide 근거 조문을 함께 표시
 */

type Role = "assistant" | "user";
type Msg = {
  role: Role;
  content: string;
  legalContext?: {
    riskScore: number;
    riskLevel: string;
    citations: Array<{ statute: string; clause: string; excerpt: string }>;
  } | null;
  legalHit?: boolean;
};

const GREETING: Msg = {
  role: "assistant",
  content:
    "기관 전용 상담원 에코입니다. 법령 해석이나 시스템 이용 방법 등 무엇이든 물어보세요!",
};

const QUICK_ASKS = [
  "명절 선물 5만원 기준이 궁금합니다",
  "부당지시를 거절하는 정식 절차는?",
  "적극행정 면책 신청 방법",
  "이해충돌 신고는 언제 해야 하나요?",
];

export default function EchoFloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── 외부 이벤트로 오픈 (EchoBubble, 기타 트리거) ────────────
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("eco:open", handler as EventListener);
    return () =>
      window.removeEventListener("eco:open", handler as EventListener);
  }, []);

  // 스크롤 자동 하단
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  // 오픈 직후 입력 포커스
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // 전역 위젯(예: 설치 배너)과 충돌 방지를 위해 채팅 열림 상태 브로드캐스트
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("eco:state", { detail: { open } })
    );
  }, [open]);

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || loading) return;
      setError(null);
      setInput("");
      const nextHistory: Msg[] = [...messages, { role: "user", content: text }];
      setMessages(nextHistory);
      setLoading(true);
      try {
        // 브라우저에서 직접 law.go.kr 판례 검색 → Vercel 서버 IP 우회
        let clientCitations: { statute: string; clause: string; excerpt: string }[] = [];
        try {
          const precs = await searchPrecedentsClient(text, 6);
          clientCitations = precedentsToCitations(precs);
        } catch {
          /* 실패해도 기존 서버측 analyzeRisk fallback 사용 */
        }

        const res = await fetch("/api/eco/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            // 서버 토큰 절약: 마지막 8턴만 보냄 + greeting 제외
            history: nextHistory
              .filter((m) => m !== GREETING)
              .slice(-9, -1)
              .map((m) => ({ role: m.role, content: m.content })),
            clientCitations,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          const msg =
            json?.message ?? json?.error ?? `오류가 발생했습니다 (HTTP ${res.status}).`;
          setError(String(msg));
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "죄송합니다. 잠시 후 다시 시도해 주세요. " + String(msg),
            },
          ]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.data.reply,
            legalContext: json.data.legalContext ?? null,
            legalHit: !!json.data.legalHit,
          },
        ]);
      } catch (err) {
        const m =
          err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.";
        setError(m);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "네트워크 연결을 확인해 주세요. " + m,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages]
  );

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [
    input,
    loading,
  ]);

  return (
    <>
      {/* Launcher (우측 하단 FAB) — 채팅이 닫힌 상태에서만 보임 */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="에코 실시간 상담창 열기"
          className="fixed bottom-20 right-5 z-[60] flex items-center gap-2 rounded-full border border-sky-300/40 bg-gradient-to-br from-navy-900/90 to-navy-950/90 px-4 py-3 text-sm font-black text-white shadow-2xl backdrop-blur-md transition-all hover:scale-[1.03] hover:border-sky-300/80 md:bottom-8 md:right-8"
          style={{
            boxShadow: "0 0 40px -10px rgba(125,211,252,0.45)",
          }}
        >
          <span className="relative grid h-8 w-8 place-items-center">
            <EchoMascot size={34} mood="welcome" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-sky-400" />
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-sky-300" />
          </span>
          <span className="hidden sm:flex flex-col items-start leading-tight">
            <span className="bg-gradient-to-r from-sky-200 to-sky-100 bg-clip-text text-[10px] font-black uppercase tracking-[0.18em] text-transparent">
              Echo · Live
            </span>
            <span className="text-[12px] font-bold">실시간 팩트 체크 상담</span>
          </span>
          <span className="flex sm:hidden items-center gap-1 text-[11px]">
            <MessageCircle className="h-3.5 w-3.5" /> Echo
          </span>
        </button>
      )}

      {/* Chat Window */}
      <div
        className={`fixed bottom-5 right-3 z-[70] flex w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-navy-950/95 shadow-2xl backdrop-blur-xl md:bottom-6 md:right-6 md:w-[400px] ${
          open
            ? "pointer-events-auto eco-chat-enter"
            : "pointer-events-none translate-y-6 opacity-0 transition-all duration-200"
        }`}
        style={{
          boxShadow:
            "0 30px 80px -20px rgba(0,0,0,0.65), 0 0 60px -25px rgba(125,211,252,0.45)",
          height: "min(560px, calc(100vh - 40px))",
        }}
        role="dialog"
        aria-label="에코 실시간 팩트 체크 상담창"
        aria-hidden={!open}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-b from-navy-900/90 to-navy-950/95 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-navy-700 to-sky-400/30">
              <EchoMascot size={32} mood="welcome" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em]">
                <span className="bg-gradient-to-r from-sky-200 to-sky-100 bg-clip-text text-transparent">
                  Ethics-Core · Live Consultant
                </span>
              </p>
              <p className="text-[13px] font-black leading-tight text-white">
                에코(Eco) · AI 청렴 파트너
              </p>
              <p className="text-[10.5px] text-steel-400">
                국가법령 API + 17,902건 판례 학습 완료
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              aria-label="처음 화면(대시보드)으로 돌아가기"
              title="처음 화면으로 돌아가시겠어요?"
              className="inline-flex items-center gap-1 rounded-lg border border-sky-300/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] font-black text-sky-200 transition-all hover:bg-sky-500/20"
            >
              <Home className="h-3 w-3" />
              Home
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="상담창 닫기"
              className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-steel-300 transition-colors hover:border-rose-400/60 hover:text-rose-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:thin]"
          style={{ scrollbarColor: "rgba(125,211,252,0.25) transparent" }}
        >
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i}>
                <MessageBubble msg={m} />
              </li>
            ))}
            {loading && (
              <li>
                <div className="flex items-start gap-2">
                  <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-800/80">
                    <EchoMascot size={24} mood="welcome" />
                  </div>
                  <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-navy-900/80 px-3 py-2">
                    <span className="flex items-center gap-2 text-[12px] text-steel-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
                      국가법령 API · 판례 데이터를 교차 확인 중…
                    </span>
                  </div>
                </div>
              </li>
            )}
          </ul>

          {messages.length <= 1 && !loading && (
            <div className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-500/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[10.5px] font-black uppercase tracking-[0.18em] text-sky-200">
                <Sparkles className="h-3 w-3" /> 빠른 시작 질문
              </p>
              <div className="mt-2 flex flex-col gap-1.5">
                {QUICK_ASKS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-lg border border-white/10 bg-navy-900/60 px-3 py-1.5 text-left text-[12px] text-white transition-colors hover:border-sky-300/40 hover:bg-navy-800/80"
                  >
                    {q}
                  </button>
                ))}
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-between rounded-lg border border-sky-300/30 bg-sky-500/10 px-3 py-1.5 text-[12px] font-black text-sky-100 transition-colors hover:bg-sky-500/20"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Home className="h-3 w-3" />
                    처음 화면으로 돌아가시겠어요?
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-sky-200">
                    Home
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="border-t border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        {/* PWA 설치 팝업 배너 */}
        {showInstall && (
          <div className="border-t border-white/10 px-3 py-3">
            <PwaInstallPrompt onDismiss={() => setShowInstall(false)} />
          </div>
        )}

        {/* 앱 설치 토글 버튼 (하단 인풋 옆) */}
        {!showInstall && (
          <div className="flex justify-center border-t border-white/5 py-1.5">
            <button
              type="button"
              onClick={() => setShowInstall(true)}
              className="flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-500/8 px-3 py-1 text-[10.5px] font-bold text-sky-300 hover:bg-sky-500/15 transition-colors"
            >
              <Download className="h-3 w-3" />
              LexGuard 앱으로 설치하기
            </button>
          </div>
        )}

        {/* Input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-end gap-2 border-t border-white/10 bg-navy-950/90 p-3"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="법령·징계·시스템 이용법까지 — 사실 기반으로 답변해 드립니다"
            className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-white/10 bg-navy-900/70 px-3 py-2 text-[13px] text-white outline-none placeholder:text-steel-500 focus:border-sky-300/50"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="메시지 전송"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-sky-600 text-white shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
 *  개별 메시지 버블
 * ───────────────────────────────────────────────────────── */
function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-sky-300/30 bg-gradient-to-br from-sky-500/20 to-navy-800/70 px-3 py-2 text-[13px] leading-relaxed text-white">
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-800/80">
        <EchoMascot size={24} mood="welcome" />
      </div>
      <div className="max-w-[85%] space-y-2">
        <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-navy-900/80 px-3 py-2 text-[13px] leading-relaxed text-steel-100 whitespace-pre-wrap">
          {msg.content}
        </div>

        {/* 법령 근거 카드 (키워드 감지 시) */}
        {msg.legalHit && msg.legalContext && (
          <LegalContextCard ctx={msg.legalContext} />
        )}
      </div>
    </div>
  );
}

function LegalContextCard({
  ctx,
}: {
  ctx: NonNullable<Msg["legalContext"]>;
}) {
  const levelColor =
    ctx.riskLevel === "CRITICAL"
      ? "text-rose-300 border-rose-400/40 bg-rose-500/10"
      : ctx.riskLevel === "HIGH"
        ? "text-violet-200 border-violet-400/40 bg-violet-500/10"
        : ctx.riskLevel === "MEDIUM"
          ? "text-sky-200 border-sky-400/40 bg-sky-500/10"
          : "text-emerald-200 border-emerald-400/40 bg-emerald-500/10";
  return (
    <div className="rounded-xl border border-sky-300/25 bg-black/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">
          <Scale className="h-3 w-3" /> Legal-Guide 연동 · 근거 조문
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${levelColor}`}
        >
          리스크 {ctx.riskScore}% · {ctx.riskLevel}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {ctx.citations.slice(0, 3).map((c, i) => (
          <li
            key={i}
            className="rounded-lg border border-white/5 bg-navy-900/60 px-2.5 py-1.5"
          >
            <p className="text-[11px] font-black text-white">
              {c.statute} <span className="text-sky-200">{c.clause}</span>
            </p>
            {c.excerpt && (
              <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-steel-300">
                {c.excerpt}
              </p>
            )}
          </li>
        ))}
      </ul>
      <a
        href="/legal-guide"
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-sky-300 hover:text-sky-200"
      >
        → Legal-Guide 심층 진단 모드로 이어서 분석
      </a>
    </div>
  );
}
