"use client";

/**
 * LegalAnalysisCards.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * 판정 중심 응답 렌더러 — 3개 유형 지원:
 *   TYPE-A: [VERDICT][WHY][CASE][ACTION][NEXT]  (리스크 판정)
 *   TYPE-B: [CASES][INTERP]                     (판례·정보 요청)
 *   TYPE-C: [GUIDE]                             (신고·후속행동)
 *
 * 디자인 원칙:
 *   - 구분선으로 섹션 구분, 카드 남발 금지
 *   - 섹션 레이블 작게, 내용 크게
 *   - 모바일 한 화면에 들어오도록 세로 최소화
 *   - 다크테마 (#0a1628 / #7dd3fc cyan) 유지
 */

import React from "react";
import { ChevronRight, ShieldCheck, Gavel } from "lucide-react";

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

interface ParsedCaseItem {
  source: string;
  year: string;
  caseNo: string;
  facts: string;
  disposition: string;
  reason: string;
}

interface ParsedTypeB {
  cases: ParsedCaseItem[];
  interpRef: string;
  interpSummary: string;
}

interface ParsedTypeC {
  headline: string;
  body: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE-A Parser
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
// TYPE-B Parser ([CASES][INTERP])
// ─────────────────────────────────────────────────────────────────────────────

function parseTypeB(narrative: string): ParsedTypeB | null {
  if (!narrative.includes("[CASES]")) return null;

  const casesStart = narrative.indexOf("[CASES]");
  const interpStart = narrative.indexOf("[INTERP]");
  const casesBody = narrative.slice(
    casesStart + "[CASES]".length,
    interpStart !== -1 ? interpStart : undefined
  ).trim();

  // 사례①②③ 또는 "사례1 사례2 사례3" 분리
  const cases: ParsedCaseItem[] = [];
  const caseMarkers = ["사례①", "사례②", "사례③", "사례1", "사례2", "사례3"];
  const casePositions = caseMarkers
    .map((m) => ({ m, idx: casesBody.indexOf(m) }))
    .filter((x) => x.idx >= 0)
    .sort((a, b) => a.idx - b.idx);

  if (casePositions.length > 0) {
    casePositions.forEach((cp, i) => {
      const start = cp.idx + cp.m.length;
      const end = i + 1 < casePositions.length ? casePositions[i + 1].idx : casesBody.length;
      const block = casesBody.slice(start, end).trim();
      cases.push(parseCaseBlock(block));
    });
  } else {
    // 블록 구분자 없으면 전체를 1건으로
    if (casesBody.trim()) cases.push(parseCaseBlock(casesBody));
  }

  // [INTERP] 파싱
  let interpRef = "";
  let interpSummary = "";
  if (interpStart !== -1) {
    const interpBody = narrative.slice(interpStart + "[INTERP]".length).trim();
    const interpLines = interpBody.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    interpRef = interpLines[0] ?? "";
    interpSummary = interpLines.slice(1).join(" ").trim();
  }

  return { cases: cases.slice(0, 3), interpRef, interpSummary };
}

function parseCaseBlock(block: string): ParsedCaseItem {
  const get = (key: string) => {
    const re = new RegExp(`^${key}[：:]\\s*(.+)`, "m");
    return block.match(re)?.[1]?.trim() ?? "";
  };
  const source = get("기관") || get("출처");
  const year = get("연도");
  const caseNo = get("사건번호") || get("번호");
  const facts = get("사실관계");
  const disposition = get("처분결과") || get("처분 결과");
  const reason = get("적용이유") || get("적용 이유");

  return { source, year, caseNo, facts, disposition, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE-C Parser ([GUIDE])
// ─────────────────────────────────────────────────────────────────────────────

function parseTypeC(narrative: string): ParsedTypeC | null {
  if (!narrative.includes("[GUIDE]")) return null;
  const guideBody = narrative.slice(narrative.indexOf("[GUIDE]") + "[GUIDE]".length).trim();
  const lines = guideBody.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const headline = lines[0]?.replace(/^🛡️\s*/, "") ?? "";
  const body = lines.slice(1).join("\n").trim();
  return { headline, body };
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
// VerdictBanner (TYPE-A)
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
  const isUnknown = sign === null;
  const accent = ok ? "#4ade80" : isUnknown ? "#fb923c" : "#f87171";
  const bg = ok
    ? "rgba(74,222,128,0.07)"
    : isUnknown
    ? "rgba(251,146,60,0.07)"
    : "rgba(248,113,113,0.07)";
  const border = ok
    ? "rgba(74,222,128,0.22)"
    : isUnknown
    ? "rgba(251,146,60,0.22)"
    : "rgba(248,113,113,0.22)";

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
          {text || "법적 판정 결과"}
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
// WhyBlock (TYPE-A)
// ─────────────────────────────────────────────────────────────────────────────

function WhyBlock({ text }: { text: string }) {
  return (
    <div>
      <Label>이유 · 처벌 수위</Label>
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
// CaseCard (TYPE-A) — 구형 단일행 & 신형 레이블형 모두 지원
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

  // ── 신형 레이블 포맷 감지 (사실관계:, 처분결과:, 출처:) ──
  const hasLabels = lines.some((l) => /^(사실관계|처분결과|출처)[：:]/.test(l));

  if (hasLabels) {
    const getField = (key: string) => {
      const line = lines.find((l) => new RegExp(`^${key}[：:]`).test(l));
      return line ? line.replace(new RegExp(`^${key}[：:]\\s*`), "").trim() : "";
    };
    const facts = getField("사실관계");
    const disposition = getField("처분결과");
    const sourceLine = getField("출처");
    const sp = sourceLine.split(/\s*\/\s*/);
    const source = sp[0] ?? "";
    const year = sp[1] ?? "";
    const caseNo = sp.slice(2).join(" / ").trim();
    const style = getSourceStyle(source);

    return (
      <div>
        <Label>처분 사례</Label>
        <div style={{ background: style.bg, border: `0.5px solid ${style.border}`, borderRadius: "10px", padding: "11px 13px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px", flexWrap: "wrap" }}>
            {source && (
              <span style={{ fontSize: "9.5px", fontWeight: 800, color: style.badge, background: `${style.badge}20`, borderRadius: "4px", padding: "2px 7px" }}>
                {source}
              </span>
            )}
            {year && <span style={{ fontSize: "11px", fontWeight: 600, color: "#3a4a6a" }}>{year}</span>}
            {caseNo && <span style={{ fontSize: "10.5px", fontWeight: 600, color: "#3a4a6a", marginLeft: "auto" }}>{caseNo}</span>}
          </div>
          {facts && (
            <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#b0bcd0", lineHeight: 1.65, margin: "0 0 7px", whiteSpace: "pre-line" }}>
              {facts}
            </p>
          )}
          {disposition && (
            <p style={{ fontSize: "12px", fontWeight: 700, color: "#f87171", margin: 0, lineHeight: 1.6 }}>
              {disposition}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── 구형 단일행 포맷 ──
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
      <div style={{ background: style.bg, border: `0.5px solid ${style.border}`, borderRadius: "10px", padding: "11px 13px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: caseNo || rest ? "6px" : 0, flexWrap: "wrap" }}>
          {source && (
            <span style={{ fontSize: "9.5px", fontWeight: 800, color: style.badge, background: `${style.badge}20`, borderRadius: "4px", padding: "2px 7px", letterSpacing: "0.04em" }}>
              {source}
            </span>
          )}
          {year && <span style={{ fontSize: "11px", fontWeight: 600, color: "#3a4a6a" }}>{year}</span>}
          {result && <span style={{ fontSize: "12px", fontWeight: 800, color: "#f87171", marginLeft: "auto" }}>{result}</span>}
        </div>
        {caseNo && <p style={{ fontSize: "11px", fontWeight: 600, color: "#3a4a6a", margin: "0 0 3px" }}>{caseNo}</p>}
        {rest && <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#b0bcd0", lineHeight: 1.65, margin: 0 }}>{rest}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionSteps (TYPE-A)
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
          const hasCircle = CIRCLED.some((c) => item.startsWith(c));
          const num = CIRCLED[i] ?? `${i + 1}.`;
          const body = hasCircle ? item.slice(1).trim() : item;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "9px" }}>
              <span style={{ fontSize: "14px", fontWeight: 900, color, flexShrink: 0, lineHeight: 1.6, minWidth: "16px" }}>{num}</span>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.75, margin: 0 }}>{body}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NextQuestions (TYPE-A)
// ─────────────────────────────────────────────────────────────────────────────

function NextQuestions({ items, onFollowUp }: { items: string[]; onFollowUp?: (q: string) => void }) {
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
              display: "flex", alignItems: "center", gap: "6px",
              background: "rgba(125,211,252,0.04)", border: "0.5px solid rgba(125,211,252,0.14)",
              borderRadius: "8px", padding: "8px 11px", cursor: "pointer", textAlign: "left", width: "100%",
            }}
          >
            <ChevronRight size={11} style={{ color: "#7dd3fc", flexShrink: 0 }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#9ab0d4", lineHeight: 1.5 }}>{q}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CasesBlock (TYPE-B) — [CASES][INTERP] 렌더러
// ─────────────────────────────────────────────────────────────────────────────

function CasesBlock({ data, onFollowUp }: { data: ParsedTypeB; onFollowUp?: (q: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
        <Gavel size={14} style={{ color: "#fb923c" }} />
        <p style={{ fontSize: "12px", fontWeight: 800, color: "#fb923c", letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>
          관련 처분 사례 {data.cases.length}건
        </p>
      </div>

      {data.cases.map((c, i) => {
        const style = getSourceStyle(c.source || "");
        return (
          <div key={i} style={{ background: style.bg, border: `0.5px solid ${style.border}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "7px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "9px", fontWeight: 800, color: style.badge, background: `${style.badge}20`, borderRadius: "4px", padding: "2px 7px" }}>
                사례{["①", "②", "③"][i] ?? i + 1}
              </span>
              {c.source && (
                <span style={{ fontSize: "9px", fontWeight: 700, color: style.badge }}>{c.source}</span>
              )}
              {c.year && <span style={{ fontSize: "10.5px", color: "#3a4a6a", fontWeight: 600 }}>{c.year}</span>}
              {c.caseNo && <span style={{ fontSize: "10px", color: "#3a4a6a", fontWeight: 600, marginLeft: "auto" }}>{c.caseNo}</span>}
            </div>
            {c.facts && (
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#b0bcd0", lineHeight: 1.65, margin: "0 0 6px", whiteSpace: "pre-line" }}>{c.facts}</p>
            )}
            {c.disposition && (
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#f87171", margin: "0 0 4px" }}>{c.disposition}</p>
            )}
            {c.reason && (
              <p style={{ fontSize: "11.5px", color: "#fb923c", margin: 0, borderLeft: "2px solid rgba(251,146,60,0.4)", paddingLeft: "8px" }}>{c.reason}</p>
            )}
          </div>
        );
      })}

      {(data.interpRef || data.interpSummary) && (
        <>
          <Divider />
          <div style={{ background: "rgba(167,139,250,0.06)", border: "0.5px solid rgba(167,139,250,0.2)", borderRadius: "10px", padding: "11px 13px" }}>
            <p style={{ fontSize: "9.5px", fontWeight: 800, color: "#c4b5fd", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 4px" }}>
              유권해석 · {data.interpRef}
            </p>
            <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#c8d4f0", margin: 0, lineHeight: 1.7 }}>{data.interpSummary}</p>
          </div>
        </>
      )}

      {onFollowUp && (
        <>
          <Divider />
          <NextQuestions
            items={["이 사례들과 제 상황의 차이점이 있나요?", "처벌 수위를 낮출 수 있는 방법이 있나요?"]}
            onFollowUp={onFollowUp}
          />
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GuideBlock (TYPE-C) — [GUIDE] 렌더러
// ─────────────────────────────────────────────────────────────────────────────

function GuideBlock({ data, onFollowUp }: { data: ParsedTypeC; onFollowUp?: (q: string) => void }) {
  // body에서 구조화된 필드 파싱
  const lines = data.body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const sections: Array<{ key: string; value: string }> = [];
  let currentKey = "";
  let currentVal: string[] = [];

  for (const line of lines) {
    const colonIdx = line.search(/[：:]/);
    if (colonIdx > 0 && colonIdx < 12) {
      if (currentKey) sections.push({ key: currentKey, value: currentVal.join("\n") });
      currentKey = line.slice(0, colonIdx).trim();
      currentVal = [line.slice(colonIdx + 1).trim()];
    } else {
      currentVal.push(line);
    }
  }
  if (currentKey) sections.push({ key: currentKey, value: currentVal.join("\n") });

  const keyColor: Record<string, string> = {
    "신고경로": "#60a5fa",
    "신분보호": "#4ade80",
    "실제사례": "#fb923c",
    "후속질문": "#7dd3fc",
  };

  // 후속질문 파싱
  const followUpSection = sections.find((s) => s.key.includes("후속"));
  const followUps = followUpSection
    ? followUpSection.value.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 4).slice(0, 2)
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* 헤드라인 */}
      <div style={{ background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.22)", borderRadius: "12px", padding: "14px 16px", display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <ShieldCheck size={20} style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }} />
        <p style={{ fontSize: "15px", fontWeight: 800, color: "#f0f0fa", margin: 0, lineHeight: 1.4 }}>
          {data.headline || "신고·보호 안내"}
        </p>
      </div>

      {/* 구조화 필드 */}
      {sections.filter((s) => !s.key.includes("후속")).map((sec, i) => {
        const color = keyColor[sec.key] ?? "#7dd3fc";
        return (
          <div key={i}>
            <Divider />
            <Label>{sec.key}</Label>
            <p style={{ fontSize: "13px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>
              {sec.value}
            </p>
          </div>
        );
      })}

      {/* 후속 질문 */}
      {followUps.length > 0 && (
        <>
          <Divider />
          <NextQuestions items={followUps} onFollowUp={onFollowUp} />
        </>
      )}

      {/* body에 구조화 필드가 없는 경우 plain text 폴백 */}
      {sections.length === 0 && data.body && (
        <>
          <Divider />
          <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>
            {data.body}
          </p>
        </>
      )}
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
  // TYPE-B: [CASES][INTERP]
  const typeBData = parseTypeB(narrative);
  if (typeBData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <CasesBlock data={typeBData} onFollowUp={onFollowUp} />
        <Disclaimer />
      </div>
    );
  }

  // TYPE-C: [GUIDE]
  const typeCData = parseTypeC(narrative);
  if (typeCData) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <GuideBlock data={typeCData} onFollowUp={onFollowUp} />
        <Disclaimer />
      </div>
    );
  }

  // TYPE-A: [VERDICT][WHY][CASE][ACTION][NEXT]
  const parsed = parseFormatD(narrative);

  if (!parsed) {
    return (
      <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.8, margin: 0, whiteSpace: "pre-line" }}>
        {narrative}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* VERDICT */}
      <VerdictBanner sign={parsed.verdictSign} text={parsed.verdictText} riskLine={parsed.riskLine} />

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

      <Disclaimer />
    </div>
  );
}

function Disclaimer() {
  return (
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
  );
}
