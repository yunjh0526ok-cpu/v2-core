"use client";

import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";

type Role = "user" | "ai";
type Stage = "collect" | "ready";
type DocType = "소명서" | "답변서" | "이의신청서" | "진술서" | null;

type CollectedData = {
  occurredAt?: string;
  department?: string;
  facts?: string;
  position?: string;
  evidence?: string;
};

type ChatMessage = { id: string; role: Role; content: string };
type GeneratedDoc = { title: string; content: string; docType: string; createdAt: string };

const FIRST_AI_MESSAGE =
  "어떤 상황인지 편하게 말씀해 주세요 😊\n감사 소명인가요? 징계 답변인가요?\n아무렇게나 말씀하시면 제가 분류해드립니다.";

const DISCLAIMER =
  "본 문서는 AI 자동 생성 초안이며 법적 효력이 없습니다. 구체 사건은 반드시 변호사 등 전문 법률가의 검토를 받으세요.";

export default function LegalDefenseChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "a0", role: "ai", content: FIRST_AI_MESSAGE },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState<Stage>("collect");
  const [docType, setDocType] = useState<DocType>(null);
  const [collectedData, setCollectedData] = useState<CollectedData>({});
  const [generated, setGenerated] = useState<GeneratedDoc | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    /** 첫 안내(a0) 제외, 직전 턴까지의 대화 (이번 사용자 메시지는 message 로만 전달) */
    const historyPayload = messages.slice(1).map((m) => ({
      role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));
    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setGenerated(null);

    try {
      const res = await fetch("/api/legal-defense/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history: historyPayload, docType }),
      });
      const json = await res.json();
      const nextStage = (json.stage as Stage) ?? "collect";
      let reply = String(json.reply ?? "").trim();
      if (!reply) {
        reply =
          nextStage === "collect"
            ? "조금 더 자세히 말씀해 주시겠어요?"
            : "작성 준비가 됐습니다. 문서를 생성할까요?";
      }
      setStage(nextStage);
      setDocType((json.docType as DocType) ?? null);
      setCollectedData((json.collectedData as CollectedData) ?? {});
      setMessages((prev) => [...prev, { id: `a-${Date.now()}`, role: "ai", content: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "ai", content: "연결 오류가 발생했습니다. 다시 입력해 주세요." },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));
    }
  }

  async function generateDoc() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/legal-defense/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType: docType ?? "소명서", collectedData }),
      });
      if (!res.ok) {
        setGenerated(null);
        return;
      }
      const json = (await res.json()) as GeneratedDoc;
      setGenerated(json);
    } catch {
      setGenerated(null);
    } finally {
      setLoading(false);
    }
  }

  function savePdf() {
    if (!generated) return;
    const w = window.open("", "_blank", "width=960,height=900");
    if (!w) return;
    const printable = [
      "문서 제목: " + generated.title,
      "",
      generated.content,
      "",
      "생성일시: " + generated.createdAt,
      "",
      "면책 문구: " + DISCLAIMER,
    ].join("\n");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${generated.title}</title>
      <style>body{font-family:Arial,sans-serif;line-height:1.6;padding:24px;white-space:pre-wrap}h1{font-size:24px;margin-bottom:12px}</style>
      </head><body>${printable.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  }

  return (
    <section className="glass flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-white/10">
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-sm font-black text-white">Legal Defense AI Chat</p>
        <p className="text-xs text-steel-300">소명서 · 답변서 · 이의신청서 · 진술서 대화형 작성</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-5 md:px-8">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "border border-sky-300/30 bg-sky-500/20 text-white"
                  : "border border-white/10 bg-navy-900/70 text-steel-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-steel-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            분석 중...
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 px-4 py-4 md:px-5">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-navy-900/70 px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="예) 감사실에서 예산 집행 관련 소명서를 제출하라고 했어요"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-steel-500"
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || input.trim().length === 0}
            className="rounded-lg bg-gradient-to-r from-sky-500 to-violet-500 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50"
          >
            <span className="inline-flex items-center gap-1">
              <Send className="h-3 w-3" /> 전송
            </span>
          </button>
        </div>

        {stage === "ready" && (
          <div className="mt-3">
            <button
              type="button"
              onClick={generateDoc}
              className="rounded-lg border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-black text-emerald-200"
            >
              📄 문서 생성하기
            </button>
          </div>
        )}

        {generated && (
          <div className="mt-4 rounded-xl border border-white/10 bg-navy-950/60 p-4">
            <p className="text-sm font-black text-white">{generated.title}</p>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-steel-100">
              {generated.content}
            </p>
            <p className="mt-2 text-[11px] text-steel-400">생성일시: {generated.createdAt}</p>
            <p className="mt-1 text-[11px] italic text-steel-500">{DISCLAIMER}</p>
            <button
              type="button"
              onClick={savePdf}
              className="mt-3 rounded-lg border border-sky-300/40 bg-sky-500/10 px-3 py-1.5 text-xs font-black text-sky-200"
            >
              PDF로 저장
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
