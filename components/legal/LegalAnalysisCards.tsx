"use client";

/**
 * LegalAnalysisCards.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 새 5섹션 포맷 [VERDICT][WHY][CASE][ACTION][NEXT] 렌더러.
 * 이전 Format A/B/C 완전 폐기 → 판정 중심 미니멀 디자인.
 *
 * 디자인 원칙:
 *   - 구분선으로 섹션 구분, 카드 남발 금지
 *   - 섹션 레이블 작게, 내용 크게
 *   - 모바일 한 화면에 들어오도록 세로 최소화
 *   - 기존 다크테마 (#0a1628 / #7dd3fc cyan) 유지
 */

import React from "react";
import { ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface ParsedFormatD {
  verdictSign: "✅" | "❌" | null;
  verdictText: string;
  riskLine: string;
  why: string;
  caseRaw: string;
  actions: string[];
  nextQuestions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

const FORMAT_D = ["[VERDICT]", "[WHY]", "[CASE]", "[ACTION]", "[NEXT]"] as const;

function splitSections(raw: string): Record<string, string> {
  const marks = FORMAT_D
    .flatMap((l) => {
      const idx = raw.indexOf(l);
      return idx >= 0 ? [{ label: l, idx }] : [];
    })
    .sort((a, b) => a.idx - b.idx);

  const result: Record<string, string> = {};
  marks.forEach((m, i) => {
    const start = m.idx + m.label.length;
    const end = i + 1 < marks.length ? marks[i + 1].idx : raw.length;
    result[m.label] = raw.slice(start, end).trim();
  });
  return result;
}

function parseFormatD(narrative: string): ParsedFormatD | null {
  const hasD = FORMAT_D.some((l) => narrative.includes(l));
  if (!hasD) return null;

  const s = splitSections(narrative);

  /* ── VERDICT ── */
  const verdictBody = s["[VERDICT]"] ?? "";
  const vLines = verdictBody.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const vFirst = vLines[0] ?? "";
  const verdictSign: "✅" | "❌" | null = vFirst.includes("✅")
    ? "✅"
    : vFirst.includes("❌")
    ? "❌"
    : null;
  const verdictText = vFirst.replace(/✅|❌/g, "").trim();
  const riskLine = vLines[1] ?? "";

  /* ── WHY ── */
  const why = s["[WHY]"] ?? "";

  /* ── CASE ── */
  const caseRaw = s["[CASE]"] ?? "";

  /* ── ACTION — ①②③ 또는 번호형 줄 파싱 ── */
  const actionBody = s["[ACTION]"] ?? "";
  const actions = actionBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && /^[①②③④⑤]|^[1-9][.)]\s/.test(l))
    .slice(0, 4);
  // fallback: 그냥 비어있지 않은 줄들
  const actionsFallback = actionBody
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4)
    .slice(0, 4);

  /* ── NEXT ── */
  const nextBody = s["[NEXT]"] ?? "";
  const nextQuestions = nextBody
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^[0-9]+[.)]\s*/, "").replace(/^[-•]\s*/, ""))
    .filter((l) => l.length > 4)
    .slice(0, 3);

  return {
    verdictSign,
    verdictText,
    riskLine,
    why,
    caseRaw,
    actions: actions.length > 0 ? actions : actionsFallback,
    nextQuestions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div
      style={{
        height: "1px",
        background:
          "linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent)",
        margin: "2px 0",
      }}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: "9.5px",
        fontWeight: 800,
        color: "#2e3f60",
        letterSpacing: "0.13em",
        textTransform: "uppercase",
        margin: "0 0 5px",
      }}
    >
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VerdictBanner
// ─────────────────────────────────────────────────────────────────────────────

function VerdictBanner({
  sign,
  text,
  riskLine,
}: {
  sign: "✅" | "❌" | null;
  text: string;
  riskLine: string;
}) {
  const ok = sign === "✅";
  const accent = ok ? "#4ade80" : "#f87171";
  const bg = ok ? "rgba(74,222,128,0.07)" : "rgba(248,113,113,0.07)";
  const border = ok ? "rgba(74,222,128,0.22)" : "rgba(248,113,113,0.22)";

  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "12px",
        padding: "14px 16px",
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
      }}
    >
      <span style={{ fontSize: "20px", lineHeight: 1, flexShrink: 0, marginTop: "2px" }}>
        {sign ?? "⚠️"}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontSize: "15px",
            fontWeight: 800,
            color: "#f0f0fa",
            margin: "0 0 3px",
            lineHeight: 1.35,
          }}
        >
          {text || "판정 결과를 분석 중입니다"}
        </p>
        {riskLine && (
          <p
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: accent,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {riskLine}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhyBlock
// ─────────────────────────────────────────────────────────────────────────────

function WhyBlock({ text }: { text: string }) {
  return (
    <div>
      <Label>이유</Label>
      <p
        style={{
          fontSize: "13.5px",
          fontWeight: 600,
          color: "#c8d4f0",
          lineHeight: 1.8,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CaseCard
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_STYLE: Record<string, { badge: string; bg: string; border: string }> = {
  대법원:     { badge: "#60a5fa", bg: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.2)" },
  국민권익위: { badge: "#fb923c", bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.2)" },
  권익위:     { badge: "#fb923c", bg: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.2)" },
  감사원:     { badge: "#4ade80", bg: "rgba(74,222,128,0.07)", border: "rgba(74,222,128,0.2)" },
  인사혁신처: { badge: "#c4b5fd", bg: "rgba(167,139,250,0.07)", border: "rgba(167,139,250,0.2)" },
};

function getSourceStyle(src: string) {
  for (const [k, v] of Object.entries(SOURCE_STYLE)) {
    if (src.includes(k)) return v;
  }
  return SOURCE_STYLE["대법원"];
}

function CaseCard({ raw }: { raw: string }) {
  if (!raw.trim()) return null;

  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const first = lines[0] ?? "";
  const parts = first.split(/\s*\/\s*/).map((s) => s.trim());
  const source   = parts[0] ?? "";
  const year     = parts[1] ?? "";
  const result   = parts[2] ?? "";
  const caseNo   = parts[3] ?? "";
  const rest     = lines.slice(1).join(" ").trim();

  const style = getSourceStyle(source);

  return (
    <div>
      <Label>처분 사례</Label>
      <div
        style={{
          background: style.bg,
          border: `0.5px solid ${style.border}`,
          borderRadius: "10px",
          padding: "11px 13px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            marginBottom: caseNo || rest ? "6px" : 0,
            flexWrap: "wrap",
          }}
        >
          {source && (
            <span
              style={{
                fontSize: "9.5px",
                fontWeight: 800,
                color: style.badge,
                background: `${style.badge}20`,
                borderRadius: "4px",
                padding: "2px 7px",
                letterSpacing: "0.04em",
              }}
            >
              {source}
            </span>
          )}
          {year && (
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#3a4a6a" }}>
              {year}
            </span>
          )}
          {result && (
            <span
              style={{
                fontSize: "12px",
                fontWeight: 800,
                color: "#f87171",
                marginLeft: "auto",
              }}
            >
              {result}
            </span>
          )}
        </div>
        {caseNo && (
          <p style={{ fontSize: "11px", fontWeight: 600, color: "#3a4a6a", margin: "0 0 3px" }}>
            {caseNo}
          </p>
        )}
        {rest && (
          <p
            style={{
              fontSize: "12.5px",
              fontWeight: 600,
              color: "#b0bcd0",
              lineHeight: 1.65,
              margin: 0,
            }}
          >
            {rest}
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionSteps
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_COLORS = ["#f87171", "#fb923c", "#4ade80", "#60a5fa"];
const CIRCLED = ["①", "②", "③", "④", "⑤"];

function ActionSteps({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <Label>즉시 조치</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        {items.map((item, i) => {
          const color = ACTION_COLORS[i % ACTION_COLORS.length];
          // 원문에 ①②③ 있으면 그대로, 없으면 추가
          const hasCircle = CIRCLED.some((c) => item.startsWith(c));
          const num = CIRCLED[i] ?? `${i + 1}.`;
          const body = hasCircle ? item.slice(1).trim() : item;
          return (
            <div
              key={i}
              style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}
            >
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 900,
                  color,
                  flexShrink: 0,
                  lineHeight: 1.6,
                  minWidth: "16px",
                }}
              >
                {num}
              </span>
              <p
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#c8d4f0",
                  lineHeight: 1.75,
                  margin: 0,
                }}
              >
                {body}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NextQuestions
// ─────────────────────────────────────────────────────────────────────────────

function NextQuestions({
  items,
  onFollowUp,
}: {
  items: string[];
  onFollowUp?: (q: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <Label>연결 질문</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {items.map((q, i) => (
          <button
            key={i}
            onClick={() => onFollowUp?.(q)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              background: "rgba(125,211,252,0.04)",
              border: "0.5px solid rgba(125,211,252,0.14)",
              borderRadius: "8px",
              padding: "8px 11px",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <ChevronRight size={11} style={{ color: "#7dd3fc", flexShrink: 0 }} />
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "#9ab0d4",
                lineHeight: 1.5,
              }}
            >
              {q}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

interface LegalAnalysisCardsProps {
  narrative: string;
  riskScore?: number;
  riskLevel?: RiskLevel;
  onFollowUp?: (text: string) => void;
}

export default function LegalAnalysisCards({
  narrative,
  riskScore: _riskScore,
  riskLevel: _riskLevel,
  onFollowUp,
}: LegalAnalysisCardsProps) {
  const parsed = parseFormatD(narrative);

  /* 포맷 D 파싱 실패 → 원문 그대로 */
  if (!parsed) {
    return (
      <p
        style={{
          fontSize: "13.5px",
          fontWeight: 600,
          color: "#c8d4f0",
          lineHeight: 1.8,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {narrative}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* VERDICT */}
      <VerdictBanner
        sign={parsed.verdictSign}
        text={parsed.verdictText}
        riskLine={parsed.riskLine}
      />

      {/* WHY */}
      {parsed.why && (
        <>
          <Divider />
          <WhyBlock text={parsed.why} />
        </>
      )}

      {/* CASE */}
      {parsed.caseRaw && (
        <>
          <Divider />
          <CaseCard raw={parsed.caseRaw} />
        </>
      )}

      {/* ACTION */}
      {parsed.actions.length > 0 && (
        <>
          <Divider />
          <ActionSteps items={parsed.actions} />
        </>
      )}

      {/* NEXT */}
      {parsed.nextQuestions.length > 0 && (
        <>
          <Divider />
          <NextQuestions items={parsed.nextQuestions} onFollowUp={onFollowUp} />
        </>
      )}

      {/* 면책 */}
      <p
        style={{
          fontSize: "10px",
          color: "#252535",
          lineHeight: 1.7,
          fontStyle: "italic",
          paddingTop: "6px",
          borderTop: "0.5px solid #151525",
          margin: 0,
        }}
      >
        본 분석은 AI 자동 분석으로 법적 효력이 없습니다. 중요 사안은 전문 법률가에게 확인하세요.
      </p>
    </div>
  );
}
