"use client";

import { useState } from "react";
import { X, Copy, FileDown, Check, FileText } from "lucide-react";

type Props = {
  formName: string;
  draft: string;
  onClose: () => void;
};

export default function FormDraftModal({ formName, draft, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch { /* noop */ }
  };

  const handlePdf = () => {
    const escaped = draft
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${formName}</title>
<style>
  @page { size: A4; margin: 22mm 18mm 22mm 28mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', Arial, sans-serif;
    font-size: 13px; color: #1a1a2e; line-height: 2; margin: 0; padding: 0;
  }
  .page-header {
    text-align: center;
    border-bottom: 2.5px solid #003399;
    padding-bottom: 12px;
    margin-bottom: 28px;
  }
  .page-header h1 { font-size: 20px; font-weight: 900; color: #001a6e; margin: 0 0 5px; }
  .page-header .sub { font-size: 11px; color: #888; }
  .form-body {
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 2.1;
    color: #1a1a2e;
    padding: 0 4px;
  }
  .disclaimer {
    font-size: 10px; color: #aaa;
    border-top: 1px solid #ddd;
    margin-top: 28px; padding-top: 10px;
    font-style: italic;
  }
</style>
</head>
<body>
<div class="page-header">
  <h1>${formName}</h1>
  <div class="sub">LexGuard AI 자동 작성 초안 · lexguardai.vercel.app</div>
</div>
<div class="form-body">${escaped}</div>
<p class="disclaimer">
  본 서식은 AI가 대화 내용을 바탕으로 자동 작성한 초안입니다.
  제출 전 반드시 내용을 검토·수정하시고, 필요한 경우 전문 법률가의 조언을 받으시기 바랍니다.
  LexGuard AI — lexguardai.vercel.app
</p>
</body>
</html>`;

    const w = window.open("", "_blank", "width=900,height=750");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 650);
    }
  };

  return (
    /* backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.78)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* modal panel */}
      <div
        className="relative flex w-full max-w-2xl flex-col rounded-2xl bg-[#0d1428] shadow-[0_32px_96px_-20px_rgba(0,200,200,0.3)]"
        style={{
          maxHeight: "90vh",
          border: "1px solid rgba(0,200,200,0.3)",
        }}
      >
        {/* ── header ── */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: "rgba(0,200,200,0.13)",
                border: "1px solid rgba(0,200,200,0.35)",
              }}
            >
              <FileText className="h-4 w-4" style={{ color: "#00c8c8" }} />
            </div>
            <div>
              <p className="text-[14px] font-black text-white">{formName}</p>
              <p className="text-[10.5px] font-semibold text-white/40">
                AI 자동 초안 · 제출 전 반드시 검토하세요
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/50 transition-all hover:bg-white/10 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* ── form preview (white card) ── */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="rounded-xl bg-white px-7 py-6 shadow-lg">
            <pre
              style={{
                whiteSpace: "pre-wrap",
                fontFamily:
                  "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif",
                fontSize: "13px",
                lineHeight: "2",
                color: "#1a1a2e",
                margin: 0,
              }}
            >
              {draft}
            </pre>
          </div>
          <p className="mt-3 text-center text-[10.5px] font-semibold text-white/35">
            __ 로 표시된 항목은 직접 채워넣으세요 · 제출 전 내용을 반드시 검토하세요
          </p>
        </div>

        {/* ── footer buttons ── */}
        <div
          className="flex items-center justify-end gap-2.5 px-5 py-4"
          style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
        >
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-black transition-all hover:opacity-85"
            style={{
              border: "1px solid rgba(0,200,200,0.45)",
              background: "rgba(0,200,200,0.09)",
              color: "#00c8c8",
            }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "복사됨!" : "복사하기"}
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12px] font-black text-white transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(to right, #00c8c8, #0088ff)",
            }}
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF 다운로드
          </button>
        </div>
      </div>
    </div>
  );
}
