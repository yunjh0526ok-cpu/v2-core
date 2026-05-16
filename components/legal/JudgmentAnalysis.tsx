"use client";

/**
 * JudgmentAnalysis.tsx
 * ────────────────────────────────────────────────────────────────
 * 판결문 심층분석 탭
 *  - 키워드 입력 → /api/law/judgment-analysis 호출
 *  - 결과: 사건별 아코디언 카드 (①②③④⑤ 섹션)
 *  - 각 카드 상단: 출처 뱃지 + 연도 + 처분 결과 강조
 *  - PDF 저장 버튼
 */

import React, { useState, useRef, useCallback } from "react";
import {
  Search,
  Loader2,
  Gavel,
  ChevronDown,
  ChevronUp,
  FileDown,
  AlertTriangle,
} from "lucide-react";
import type { JudgmentCase } from "@/app/api/law/judgment-analysis/route";

// ─────────────────────────────────────────────────────────────────
// Source color map
// ─────────────────────────────────────────────────────────────────

const SOURCE_COLORS: Record<
  JudgmentCase["source"],
  { badge: string; dot: string; bar: string }
> = {
  대법원: {
    badge: "bg-blue-500/20 border-blue-400/30 text-blue-200",
    dot: "bg-blue-400",
    bar: "#60a5fa",
  },
  국민권익위: {
    badge: "bg-orange-500/20 border-orange-400/30 text-orange-200",
    dot: "bg-orange-400",
    bar: "#fb923c",
  },
  감사원: {
    badge: "bg-emerald-500/20 border-emerald-400/30 text-emerald-200",
    dot: "bg-emerald-400",
    bar: "#34d399",
  },
  인사혁신처: {
    badge: "bg-violet-500/20 border-violet-400/30 text-violet-200",
    dot: "bg-violet-400",
    bar: "#a78bfa",
  },
};

// ─────────────────────────────────────────────────────────────────
// Section Row
// ─────────────────────────────────────────────────────────────────

function SectionRow({
  marker,
  label,
  content,
  accent,
}: {
  marker: string;
  label: string;
  content: string;
  accent: string;
}) {
  if (!content) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        padding: "8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          background: `${accent}33`,
          border: `1px solid ${accent}66`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "10px",
          fontWeight: 800,
          color: accent,
          marginTop: "2px",
        }}
      >
        {marker}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "10px",
            fontWeight: 800,
            color: "#2e3f60",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            margin: "0 0 3px",
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "rgba(240,240,250,0.88)",
            lineHeight: 1.65,
            margin: 0,
          }}
        >
          {content}
        </p>
      </div>
    </div>
  );
}

// (DispositionRow removed — disposition now rendered as SectionRow with full text)

// ─────────────────────────────────────────────────────────────────
// JudgmentCard (아코디언)
// ─────────────────────────────────────────────────────────────────

function JudgmentCard({
  item,
  index,
  onPdfSave,
}: {
  item: JudgmentCase;
  index: number;
  onPdfSave: (item: JudgmentCase) => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const colors = SOURCE_COLORS[item.source] ?? SOURCE_COLORS["대법원"];
  const accent = colors.bar;

  return (
    <div
      style={{
        borderRadius: "14px",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(10,22,40,0.65)",
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "14px 16px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {/* Index */}
        <span
          style={{
            flexShrink: 0,
            width: "24px",
            height: "24px",
            borderRadius: "50%",
            background: `${accent}22`,
            border: `1px solid ${accent}55`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "11px",
            fontWeight: 900,
            color: accent,
          }}
        >
          {index + 1}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <p
            style={{
              fontSize: "14px",
              fontWeight: 800,
              color: "#f0f0fa",
              margin: "0 0 4px",
              lineHeight: 1.35,
            }}
          >
            {item.title || `판결·결정례 ${index + 1}`}
          </p>

          {/* Meta row */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "99px",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.04em",
              }}
              className={`border ${colors.badge}`}
            >
              {item.source}
            </span>
            {item.year && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                {item.year}
              </span>
            )}
            {item.caseNo && (
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b" }}>
                · {item.caseNo}
              </span>
            )}
            {item.verdict && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#fbbf24",
                  whiteSpace: "nowrap",
                  maxWidth: "200px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.verdict.slice(0, 30)}{item.verdict.length > 30 ? "…" : ""}
              </span>
            )}
          </div>
        </div>

        {open ? (
          <ChevronUp
            style={{ flexShrink: 0, color: "#64748b", width: "16px", height: "16px" }}
          />
        ) : (
          <ChevronDown
            style={{ flexShrink: 0, color: "#64748b", width: "16px", height: "16px" }}
          />
        )}
      </button>

      {/* Accordion body */}
      {open && (
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.05)",
            padding: "12px 16px 14px",
          }}
        >
          <SectionRow
            marker="①"
            label="판결 요지"
            content={item.verdict}
            accent="#fbbf24"
          />
          <SectionRow
            marker="②"
            label="결정적 위반 행위"
            content={item.violation}
            accent="#f87171"
          />
          <SectionRow
            marker="③"
            label="당사자 변명 vs 법원·위원회 판단"
            content={item.defense}
            accent="#a78bfa"
          />
          <SectionRow
            marker="④"
            label="적용 법령 및 처분"
            content={item.disposition}
            accent="#60a5fa"
          />
          <SectionRow
            marker="⑤"
            label="처분 후 결과"
            content={item.afterResult}
            accent="#fb923c"
          />
          {item.lesson && (
            <div
              style={{
                marginTop: "10px",
                padding: "10px 12px",
                borderRadius: "10px",
                background: `${accent}0d`,
                border: `1px solid ${accent}33`,
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  color: accent,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  margin: "0 0 4px",
                }}
              >
                ⑥ 내 상황 핵심 교훈
              </p>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: "rgba(240,240,250,0.92)",
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                {item.lesson}
              </p>
            </div>
          )}

          {/* PDF button */}
          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              onClick={() => onPdfSave(item)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "10px",
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.3)",
                color: "#c4b5fd",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <FileDown style={{ width: "14px", height: "14px" }} />
              PDF 저장
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// PDF print helper
// ─────────────────────────────────────────────────────────────────

function printJudgmentCase(item: JudgmentCase) {
  const esc = (s: string) =>
    (s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");

  const sec = (num: string, label: string, content: string, color = "#3366cc") =>
    content
      ? `<div class="section">
          <div class="section-title" style="color:${color};border-color:${color}33">${num} ${label}</div>
          <div class="section-body">${esc(content)}</div>
        </div>`
      : "";

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>LexGuard AI 판결문 심층분석</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 30mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans KR','Apple SD Gothic Neo',Arial,sans-serif; font-size:13px; color:#1a1a2e; line-height:1.85; margin:0; }
  header { border-bottom:3px solid #3366cc; padding-bottom:12px; margin-bottom:18px; }
  header h1 { font-size:20px; color:#0d1f3d; margin:0 0 4px; }
  .meta { font-size:11px; color:#666; }
  .badge { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:#e8f0ff; color:#3366cc; margin-left:6px; }
  .section { margin:14px 0; }
  .section-title { font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.12em; margin-bottom:5px; padding-bottom:4px; border-bottom:1px solid #dde8ff; }
  .section-body { font-size:13px; color:#1a1a2e; white-space:pre-wrap; line-height:1.85; }
  .lesson { background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:10px 14px; margin-top:14px; font-size:13px; line-height:1.75; }
  .disclaimer { font-size:10px; color:#999; border-top:1px solid #ddd; margin-top:20px; padding-top:8px; font-style:italic; }
</style>
</head>
<body>
<header>
  <h1>⚖ LexGuard AI · 판결문 심층분석</h1>
  <div class="meta">
    분석 일시: ${new Date().toLocaleString("ko-KR")}
    <span class="badge">${item.source}</span>
    ${item.year ? `<span class="badge">${item.year}</span>` : ""}
    ${item.caseNo ? `<span class="badge">${item.caseNo}</span>` : ""}
  </div>
</header>

<div class="section">
  <div class="section-title" style="color:#1a1a2e;border-color:#ccc">사건명</div>
  <div class="section-body" style="font-size:15px;font-weight:800">${esc(item.title)}</div>
</div>

${sec("①", "판결 요지", item.verdict, "#b45309")}
${sec("②", "결정적 위반 행위", item.violation, "#b91c1c")}
${sec("③", "당사자 변명 vs 법원·위원회 판단", item.defense, "#7c3aed")}
${sec("④", "적용 법령 및 처분", item.disposition, "#1d4ed8")}
${sec("⑤", "처분 후 결과", item.afterResult, "#c2410c")}

${item.lesson ? `<div class="lesson"><b style="color:#1d4ed8">⑥ 내 상황 핵심 교훈:</b> ${esc(item.lesson)}</div>` : ""}

<p class="disclaimer">본 분석은 AI 자동 분석으로 법적 효력이 없습니다. LexGuard AI — lexguardai.vercel.app</p>
</body>
</html>`;

  const w = window.open("", "_blank", "width=900,height=750");
  if (w) {
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  }
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

export default function JudgmentAnalysis() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [cases, setCases] = useState<JudgmentCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const analyze = useCallback(async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;

    setLoading(true);
    setError(null);
    setCases([]);
    setSearched(false);

    try {
      const res = await fetch("/api/law/judgment-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });

      if (!res.ok) {
        const status = res.status;
        setError(
          status === 429
            ? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요."
            : status >= 500
            ? "일시적인 오류입니다. 다시 시도해 주세요."
            : "연결에 문제가 발생했습니다. 다시 시도해 주세요."
        );
        return;
      }

      const json = await res.json();
      if (!json.ok || !Array.isArray(json.cases) || json.cases.length === 0) {
        setError("판결·결정례를 가져오지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      setCases(json.cases);
    } catch {
      setError("연결에 문제가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  }, [input, loading]);

  const EXAMPLE_QUERIES = [
    "명절 선물 수수 공무원 징계",
    "공사 업체 식사 접대 처분",
    "내부 정보 이용 부동산 투기",
    "부당 지시 거부 불이익",
    "갑질 상사 징계 사례",
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      {/* Search card */}
      <div
        className="glass"
        style={{
          borderRadius: "20px",
          padding: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginBottom: "16px",
          }}
        >
          <span
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "linear-gradient(135deg,#f59e0b,#ef4444)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Gavel style={{ width: "18px", height: "18px", color: "#fff" }} />
          </span>
          <div>
            <p
              style={{
                fontSize: "15px",
                fontWeight: 900,
                color: "#f0f0fa",
                margin: 0,
              }}
            >
              판결문 심층분석
            </p>
            <p
              style={{
                fontSize: "11.5px",
                fontWeight: 600,
                color: "#64748b",
                margin: 0,
              }}
            >
              상황 키워드 또는 질문 입력 → 실제 처분 사례 3건 심층 분석
            </p>
          </div>
        </div>

        {/* Input */}
        <div
          className="gradient-border"
          style={{ borderRadius: "12px", background: "rgba(10,22,40,0.8)", marginBottom: "12px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
            }}
          >
            <Search style={{ width: "15px", height: "15px", color: "#7dd3fc", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && analyze()}
              placeholder="예) 민원인이 명절 선물을 보냈습니다 · 계약 업체 식사 접대 받았습니다"
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "#f0f0fa",
                fontSize: "13px",
                fontWeight: 600,
              }}
            />
            <button
              type="button"
              onClick={() => analyze()}
              disabled={loading || input.trim().length === 0}
              style={{
                flexShrink: 0,
                padding: "7px 16px",
                borderRadius: "9px",
                background: "linear-gradient(to right,#f59e0b,#ef4444)",
                border: "none",
                color: "#fff",
                fontSize: "12px",
                fontWeight: 900,
                cursor: "pointer",
                opacity: loading || input.trim().length === 0 ? 0.5 : 1,
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              {loading ? (
                <Loader2 style={{ width: "13px", height: "13px" }} className="animate-spin" />
              ) : (
                <Gavel style={{ width: "13px", height: "13px" }} />
              )}
              심층분석
            </button>
          </div>
        </div>

        {/* Example chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {EXAMPLE_QUERIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setInput(q);
                analyze(q);
              }}
              disabled={loading}
              style={{
                padding: "5px 12px",
                borderRadius: "99px",
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "#fcd34d",
                fontSize: "11.5px",
                fontWeight: 700,
                cursor: "pointer",
                opacity: loading ? 0.5 : 1,
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div
          className="glass"
          style={{
            borderRadius: "16px",
            padding: "32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <Loader2
            style={{ width: "28px", height: "28px", color: "#f59e0b" }}
            className="animate-spin"
          />
          <p
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#fcd34d",
              margin: 0,
            }}
          >
            판결문을 분석하고 있습니다...
          </p>
          <p
            style={{
              fontSize: "12px",
              fontWeight: 600,
              color: "#64748b",
              margin: 0,
            }}
          >
            대법원·국민권익위·감사원·인사혁신처 결정례 검색 중
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            borderRadius: "14px",
            border: "1px solid rgba(248,113,113,0.3)",
            background: "rgba(248,113,113,0.07)",
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <AlertTriangle style={{ width: "16px", height: "16px", color: "#f87171", flexShrink: 0 }} />
          <p style={{ fontSize: "13px", fontWeight: 600, color: "#f87171", margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Results */}
      {!loading && cases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "4px",
            }}
          >
            <p
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "#64748b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                margin: 0,
              }}
            >
              심층분석 결과 · {cases.length}건
            </p>
          </div>

          {cases.map((item, i) => (
            <JudgmentCard
              key={i}
              item={item}
              index={i}
              onPdfSave={printJudgmentCase}
            />
          ))}

          <p
            style={{
              fontSize: "10.5px",
              fontWeight: 600,
              color: "#475569",
              textAlign: "center",
              padding: "8px 0",
              margin: 0,
            }}
          >
            본 분석은 AI 기반 자동 분석으로 법적 효력이 없습니다. 구체적인 사안은 전문 법률가의 조언을 받으세요.
          </p>
        </div>
      )}

      {/* Empty state */}
      {!loading && searched && cases.length === 0 && !error && (
        <div
          className="glass"
          style={{
            borderRadius: "16px",
            padding: "32px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#64748b", margin: 0 }}>
            검색 결과가 없습니다. 다른 키워드로 다시 시도해 주세요.
          </p>
        </div>
      )}
    </div>
  );
}
