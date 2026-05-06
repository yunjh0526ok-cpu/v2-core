"use client";

/**
 * LegalAnalysisCards.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * AI 응답(narrative)을 파싱해 구조화 카드·스텝퍼·배지로 시각화.
 * 두 가지 Gemini 출력 포맷을 모두 지원:
 *   A) ▶ 핵심 답변 / ▶ 예상 시나리오 / ▶ 실행 로드맵 / ▶ 근거 법령 / ▶ 관련 판례 / ▶ 변호사 조언 / ▶ 리스크
 *   B) [상황 진단] / [법령 근거] / [변호사 조언] / [권고 조치]
 * 기존 로직(분석 API, 리스크 계산 등)은 일절 수정하지 않음.
 */

import React from "react";
import {
  ShieldAlert,
  BookOpen,
  Gavel,
  Lightbulb,
  Map,
  Scale,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ChevronRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface ParsedAnalysis {
  coreAnswer?: string;
  scenarios?: string;
  roadmap?: RoadmapStep[];
  statutes?: StatuteItem[];
  precedents?: PrecedentItem[];
  lawyerNote?: string;
  riskRaw?: string;
  situationDiagnosis?: string;
  legalBasis?: string;
  recommendedActions?: string[];
}

interface RoadmapStep {
  phase: string;
  action: string;
}

interface StatuteItem {
  name: string;
  clause: string;
  excerpt?: string;
}

interface PrecedentItem {
  outcome: "승소" | "패소" | "기타";
  caseNo: string;
  court?: string;
  date?: string;
  gist?: string;
  key?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/** ▶ 헤더 기반 섹션 파싱 (Format A) */
const FORMAT_A_LABELS = [
  "▶ 핵심 답변",
  "▶ 예상 시나리오",
  "▶ 실행 로드맵",
  "▶ 근거 법령",
  "▶ 관련 판례",
  "▶ 변호사 조언",
  "▶ 리스크",
] as const;

/** [] 헤더 기반 섹션 파싱 (Format B) */
const FORMAT_B_LABELS = [
  "[상황 진단]",
  "[법령 근거]",
  "[변호사 조언]",
  "[법률 전문가 조언]",
  "[권고 조치]",
] as const;

type FormatALabel = (typeof FORMAT_A_LABELS)[number];
type FormatBLabel = (typeof FORMAT_B_LABELS)[number];

function splitBySections(
  raw: string,
  labels: readonly string[]
): Record<string, string> {
  const marks = labels
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

function parseRoadmap(body: string): RoadmapStep[] {
  const phases = ["오늘", "1주", "1주일", "1개월", "단기", "중기", "장기", "즉시"];
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  // "오늘 → 1주 → 1개월" 형식 분할
  const arrowLine = lines.find((l) => l.includes("→"));
  if (arrowLine && lines.length <= 3) {
    const parts = arrowLine.split("→").map((s) => s.trim());
    const actions = lines.filter((l) => !l.includes("→"));
    return parts.map((phase, i) => ({
      phase,
      action: actions[i] ?? "",
    }));
  }

  // "1단계:", "2단계:" 형식
  const stageLines = lines.filter((l) => /^[0-9]+단계/.test(l));
  if (stageLines.length > 0) {
    return stageLines.map((l) => {
      const [stage, ...rest] = l.split(/[:：]/);
      return { phase: stage.trim(), action: rest.join(":").trim() };
    });
  }

  // "오늘:", "1주:" 등
  const phaseLines = lines.filter((l) =>
    phases.some((p) => l.startsWith(p))
  );
  if (phaseLines.length > 0) {
    return phaseLines.map((l) => {
      const sep = l.search(/[:：\s]/);
      return {
        phase: sep > 0 ? l.slice(0, sep).trim() : l,
        action: sep > 0 ? l.slice(sep + 1).trim() : "",
      };
    });
  }

  // 번호/불릿 목록
  const listItems = lines
    .filter((l) => /^[-•*]|^[0-9]+[.)]\s/.test(l))
    .map((l) => l.replace(/^[-•*]|^[0-9]+[.)]\s*/, "").trim());

  if (listItems.length >= 2) {
    const labels = ["즉시", "단기", "중기", "장기"];
    return listItems.slice(0, 4).map((action, i) => ({
      phase: labels[i] ?? `${i + 1}단계`,
      action,
    }));
  }

  // 아예 다른 형식 → 단일 블록
  return [{ phase: "실행", action: body.slice(0, 200) }];
}

function parseStatutes(body: string): StatuteItem[] {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return lines
    .filter((l) => l.length > 3)
    .slice(0, 6)
    .map((l) => {
      // "청탁금지법 제8조 — 내용" 형식
      const dashIdx = l.search(/[-–—]/);
      const hasClause = /제\s*\d+/.test(l);

      if (dashIdx > 0 && hasClause) {
        const clausePart = l.slice(0, dashIdx).trim();
        const excerpt = l.slice(dashIdx + 1).trim();
        const spaceIdx = clausePart.search(/\s+제/);
        const name = spaceIdx > 0 ? clausePart.slice(0, spaceIdx).trim() : "";
        const clause = spaceIdx > 0 ? clausePart.slice(spaceIdx + 1).trim() : clausePart;
        return { name, clause, excerpt };
      }

      // "· 법령명 제X조(제목)" 형식
      const cleaned = l.replace(/^[-•·*▸]+\s*/, "");
      const matchClause = cleaned.match(/(.+?)\s+(제\s*\d+.+)$/);
      if (matchClause) {
        return {
          name: matchClause[1].trim(),
          clause: matchClause[2].trim(),
          excerpt: "",
        };
      }

      return { name: "", clause: cleaned, excerpt: "" };
    })
    .filter((s) => s.clause.length > 2);
}

function parsePrecedents(body: string): PrecedentItem[] {
  const items: PrecedentItem[] = [];
  const blocks = body.split(/(?=\[승소 사례\]|\[패소 사례\])/g);

  for (const block of blocks) {
    const isWin = block.startsWith("[승소 사례]");
    const isLose = block.startsWith("[패소 사례]");
    if (!isWin && !isLose) continue;

    const outcome: PrecedentItem["outcome"] = isWin ? "승소" : "패소";
    const rest = block.replace(/\[승소 사례\]|\[패소 사례\]/, "").trim();

    // "사건번호 | 법원 | 날짜" 파싱
    const firstLine = rest.split(/\r?\n/)[0];
    const parts = firstLine.split("|").map((s) => s.trim());
    const caseNo = parts[0] ?? "";
    const court = parts[1] ?? "";
    const date = parts[2] ?? "";

    // → 핵심 요지 / → 승소/패소 근거
    const gistMatch = rest.match(/→\s*핵심 요지[:：]?\s*(.+)/);
    const keyMatch = rest.match(/→\s*(?:승소|패소)\s*(?:근거|원인)[:：]?\s*(.+)/);

    items.push({
      outcome,
      caseNo,
      court,
      date,
      gist: gistMatch?.[1]?.trim(),
      key: keyMatch?.[1]?.trim(),
    });
  }

  return items;
}

function parseNarrative(narrative: string): ParsedAnalysis {
  if (!narrative) return {};

  const hasFormatA = FORMAT_A_LABELS.some((l) => narrative.includes(l));
  const hasFormatB = FORMAT_B_LABELS.some((l) => narrative.includes(l));

  if (hasFormatA) {
    const sections = splitBySections(narrative, FORMAT_A_LABELS) as Record<FormatALabel, string>;

    return {
      coreAnswer: sections["▶ 핵심 답변"],
      scenarios: sections["▶ 예상 시나리오"],
      roadmap: sections["▶ 실행 로드맵"] ? parseRoadmap(sections["▶ 실행 로드맵"]) : undefined,
      statutes: sections["▶ 근거 법령"] ? parseStatutes(sections["▶ 근거 법령"]) : undefined,
      precedents: sections["▶ 관련 판례"] ? parsePrecedents(sections["▶ 관련 판례"]) : undefined,
      lawyerNote: sections["▶ 변호사 조언"],
      riskRaw: sections["▶ 리스크"],
    };
  }

  if (hasFormatB) {
    const sections = splitBySections(narrative, FORMAT_B_LABELS) as Record<FormatBLabel, string>;
    const actionBody =
      sections["[권고 조치]"] ?? "";
    const actionItems = actionBody
      .split(/\r?\n/)
      .map((l) => l.trim().replace(/^[0-9]+[.)]\s*/, "").replace(/^[-•]\s*/, ""))
      .filter(Boolean);

    return {
      situationDiagnosis: sections["[상황 진단]"],
      legalBasis: sections["[법령 근거]"],
      lawyerNote: sections["[변호사 조언]"] ?? sections["[법률 전문가 조언]"],
      recommendedActions: actionItems.length > 0 ? actionItems : undefined,
    };
  }

  return {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk badge helpers
// ─────────────────────────────────────────────────────────────────────────────

function riskColor(level?: RiskLevel): { bg: string; border: string; text: string; glow: string } {
  switch (level) {
    case "CRITICAL":
      return { bg: "#1f0a14", border: "#7f1d1d", text: "#f87171", glow: "rgba(239,68,68,0.2)" };
    case "HIGH":
      return { bg: "#1a0d2e", border: "#5b21b6", text: "#c4b5fd", glow: "rgba(167,139,250,0.2)" };
    case "MEDIUM":
      return { bg: "#0d1320", border: "#1e3a5f", text: "#818cf8", glow: "rgba(129,140,248,0.2)" };
    default:
      return { bg: "#0d1f14", border: "#166534", text: "#4ade80", glow: "rgba(74,222,128,0.15)" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function CardHeader({
  icon,
  label,
  sub,
  accent = "sky",
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  accent?: "sky" | "violet" | "amber" | "green" | "rose";
}) {
  const colors: Record<string, string> = {
    sky: "#7dd3fc",
    violet: "#c4b5fd",
    amber: "#fbbf24",
    green: "#4ade80",
    rose: "#fb7185",
  };
  const c = colors[accent] ?? colors.sky;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "12px",
        paddingBottom: "10px",
        borderBottom: "0.5px solid rgba(255,255,255,0.08)",
      }}
    >
      <span style={{ color: c, display: "flex", alignItems: "center" }}>{icon}</span>
      <div>
        <p style={{ fontSize: "13px", fontWeight: 800, color: "#f0f0fa", margin: 0 }}>
          {label}
        </p>
        {sub && (
          <p style={{ fontSize: "10px", color: "#5b6ea1", margin: "2px 0 0", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function CoreAnswerCard({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "#0a1628",
        border: "0.5px solid #1a3a5c",
        borderRadius: "14px",
        padding: "16px",
        boxShadow: "0 0 24px rgba(125,211,252,0.06)",
      }}
    >
      <CardHeader
        icon={<Scale size={15} />}
        label="핵심 답변"
        sub="Core Answer"
        accent="sky"
      />
      <p
        style={{
          fontSize: "14px",
          fontWeight: 600,
          color: "#e0e8ff",
          lineHeight: 1.75,
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}

function SituationCard({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "#0a1628",
        border: "0.5px solid #1a3a5c",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<Lightbulb size={15} />}
        label="상황 진단"
        sub="Situation Diagnosis"
        accent="sky"
      />
      <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.75, margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

function RoadmapStepper({ steps }: { steps: RoadmapStep[] }) {
  const phaseColors = [
    { bg: "#0d1f35", border: "#1a3a5c", num: "#88bbff", track: "#1a3a5c" },
    { bg: "#0d1f14", border: "#1a3d22", num: "#77cc88", track: "#1a3d22" },
    { bg: "#1f160a", border: "#3d2a0e", num: "#ffbb55", track: "#3d2a0e" },
    { bg: "#1a0d2e", border: "#3b1d5c", num: "#bb88ff", track: "#3b1d5c" },
  ];

  return (
    <div
      style={{
        background: "#070c1b",
        border: "0.5px solid #1a2040",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<Map size={15} />}
        label="실행 로드맵"
        sub="Action Roadmap"
        accent="amber"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {steps.map((step, i) => {
          const c = phaseColors[i % phaseColors.length];
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "50%",
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: 800,
                    color: c.num,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div style={{ width: "1px", height: "12px", background: c.track, marginTop: "2px" }} />
                )}
              </div>
              <div style={{ flex: 1, paddingTop: "4px" }}>
                <span
                  style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 800,
                    color: c.num,
                    background: c.bg,
                    border: `0.5px solid ${c.border}`,
                    borderRadius: "4px",
                    padding: "1px 7px",
                    marginBottom: "4px",
                    letterSpacing: "0.04em",
                  }}
                >
                  {step.phase}
                </span>
                {step.action && (
                  <p
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#c8d4f0",
                      lineHeight: 1.65,
                      margin: 0,
                    }}
                  >
                    {step.action}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatutesCard({ items }: { items: StatuteItem[] }) {
  return (
    <div
      style={{
        background: "#0a1220",
        border: "0.5px solid #1a2540",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<BookOpen size={15} />}
        label="근거 법령"
        sub="Legal Basis"
        accent="violet"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((s, i) => (
          <div
            key={i}
            style={{
              background: "#0d1733",
              border: "0.5px solid #1e3058",
              borderRadius: "10px",
              padding: "10px 12px",
            }}
          >
            {s.name && (
              <p style={{ fontSize: "11px", fontWeight: 800, color: "#7dd3fc", margin: "0 0 2px", letterSpacing: "0.04em" }}>
                {s.name}
              </p>
            )}
            <p style={{ fontSize: "12.5px", fontWeight: 700, color: "#c4b5fd", margin: "0 0 4px" }}>
              {s.clause}
            </p>
            {s.excerpt && (
              <p style={{ fontSize: "11.5px", color: "#7888aa", lineHeight: 1.6, margin: 0, borderLeft: "2px solid #3b4f80", paddingLeft: "8px" }}>
                {s.excerpt}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LegalBasisCard({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return (
    <div
      style={{
        background: "#0a1220",
        border: "0.5px solid #1a2540",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<BookOpen size={15} />}
        label="법령 근거"
        sub="Legal Basis"
        accent="violet"
      />
      {lines.length > 1 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          {lines.map((l, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
              <ChevronRight size={12} style={{ color: "#c4b5fd", flexShrink: 0, marginTop: "3px" }} />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.65 }}>
                {l.replace(/^[-•·]\s*/, "")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.75, margin: 0 }}>
          {text}
        </p>
      )}
    </div>
  );
}

function PrecedentsCard({ items }: { items: PrecedentItem[] }) {
  if (items.length === 0) return null;

  return (
    <div
      style={{
        background: "#0a100e",
        border: "0.5px solid #1a3022",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<Gavel size={15} />}
        label="관련 판례"
        sub="Case Precedents"
        accent="green"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {items.map((p, i) => {
          const isWin = p.outcome === "승소";
          const outcomeStyle = isWin
            ? { bg: "#0d1f14", border: "#1a3d22", text: "#4ade80", label: "승소" }
            : { bg: "#1f0a14", border: "#5c1a2a", text: "#f87171", label: "패소" };

          return (
            <div
              key={i}
              style={{
                background: outcomeStyle.bg,
                border: `0.5px solid ${outcomeStyle.border}`,
                borderRadius: "10px",
                padding: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <p style={{ fontSize: "12.5px", fontWeight: 800, color: "#e0e8ff", margin: 0 }}>
                  {p.caseNo}
                  {p.court && (
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#8892b0", marginLeft: "6px" }}>
                      {p.court}
                    </span>
                  )}
                </p>
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 800,
                    color: outcomeStyle.text,
                    background: `${outcomeStyle.text}22`,
                    border: `0.5px solid ${outcomeStyle.border}`,
                    borderRadius: "4px",
                    padding: "2px 8px",
                  }}
                >
                  {outcomeStyle.label}
                </span>
              </div>
              {p.gist && (
                <p style={{ fontSize: "12px", fontWeight: 600, color: "#b0bcd0", lineHeight: 1.6, margin: "0 0 4px" }}>
                  {p.gist}
                </p>
              )}
              {p.key && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "6px",
                    padding: "6px 8px",
                    background: "rgba(255,255,255,0.03)",
                    borderRadius: "6px",
                    marginTop: "4px",
                  }}
                >
                  {isWin
                    ? <CheckCircle2 size={11} style={{ color: "#4ade80", flexShrink: 0, marginTop: "2px" }} />
                    : <AlertTriangle size={11} style={{ color: "#f87171", flexShrink: 0, marginTop: "2px" }} />}
                  <span style={{ fontSize: "11.5px", color: "#8892b0", lineHeight: 1.55 }}>{p.key}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LawyerNoteCard({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  return (
    <div
      style={{
        background: "#120d1f",
        border: "0.5px solid #2a1a4e",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<Scale size={15} />}
        label="변호사 조언"
        sub="Legal Expert Note"
        accent="violet"
      />
      {lines.length > 1 ? (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          {lines.map((l, i) => (
            <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  background: "rgba(167,139,250,0.15)",
                  border: "0.5px solid rgba(167,139,250,0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "10px",
                  fontWeight: 800,
                  color: "#c4b5fd",
                  flexShrink: 0,
                  marginTop: "1px",
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.7 }}>
                {l.replace(/^[0-9]+[.)]\s*/, "").replace(/^[-•]\s*/, "")}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p style={{ fontSize: "13.5px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.75, margin: 0 }}>
          {text}
        </p>
      )}
    </div>
  );
}

function ActionsCard({ items }: { items: string[] }) {
  return (
    <div
      style={{
        background: "#0d1320",
        border: "0.5px solid #1a2540",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<CheckCircle2 size={15} />}
        label="권고 조치"
        sub="Recommended Actions"
        accent="green"
      />
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
        {items.map((a, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              background: "#0d1f14",
              border: "0.5px solid #1a3d22",
              borderRadius: "10px",
              padding: "10px 12px",
            }}
          >
            <span
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "8px",
                background: "rgba(74,222,128,0.12)",
                border: "0.5px solid rgba(74,222,128,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 800,
                color: "#4ade80",
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.65 }}>
              {a}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ScenariosCard({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const scenarios = lines.filter((l) => /만약|경우|상황|시나리오|케이스/.test(l) || /^[-•▸]/.test(l));

  return (
    <div
      style={{
        background: "#0d1220",
        border: "0.5px solid #1e2a45",
        borderRadius: "14px",
        padding: "16px",
      }}
    >
      <CardHeader
        icon={<TrendingUp size={15} />}
        label="예상 시나리오"
        sub="Predicted Scenarios"
        accent="sky"
      />
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {(scenarios.length > 0 ? scenarios : lines).slice(0, 4).map((line, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
              padding: "8px 10px",
              background: "rgba(125,211,252,0.04)",
              borderRadius: "8px",
              border: "0.5px solid rgba(125,211,252,0.12)",
            }}
          >
            <ChevronRight size={13} style={{ color: "#7dd3fc", flexShrink: 0, marginTop: "2px" }} />
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#c8d4f0", lineHeight: 1.65 }}>
              {line.replace(/^[-•▸]\s*/, "")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RiskBadge({
  riskScore,
  riskLevel,
  riskRaw,
}: {
  riskScore?: number;
  riskLevel?: RiskLevel;
  riskRaw?: string;
}) {
  const c = riskColor(riskLevel);
  const label = riskLevel ?? "LOW";
  const score = riskScore ?? 0;

  return (
    <div
      style={{
        background: c.bg,
        border: `0.5px solid ${c.border}`,
        borderRadius: "12px",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: `0 0 20px ${c.glow}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <ShieldAlert size={16} style={{ color: c.text }} />
        <span style={{ fontSize: "13px", fontWeight: 800, color: "#e0e8ff" }}>
          종합 리스크
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {score > 0 && (
          <span style={{ fontSize: "20px", fontWeight: 900, color: c.text, fontVariantNumeric: "tabular-nums" }}>
            {score}%
          </span>
        )}
        <span
          style={{
            fontSize: "11px",
            fontWeight: 800,
            color: c.text,
            background: `${c.text}22`,
            border: `0.5px solid ${c.border}`,
            borderRadius: "6px",
            padding: "3px 10px",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </span>
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
  riskScore,
  riskLevel,
  onFollowUp: _onFollowUp,
}: LegalAnalysisCardsProps) {
  const parsed = parseNarrative(narrative);

  const hasFormatA = !!(
    parsed.coreAnswer ||
    parsed.roadmap ||
    parsed.statutes ||
    parsed.precedents ||
    parsed.lawyerNote
  );

  const hasFormatB = !!(
    parsed.situationDiagnosis ||
    parsed.legalBasis ||
    parsed.recommendedActions
  );

  // 파싱에 실패했으면 기존 텍스트를 있는 그대로 보여줌
  if (!hasFormatA && !hasFormatB) {
    return (
      <p style={{ fontSize: "14px", fontWeight: 600, color: "#d0d8f0", lineHeight: 1.75, margin: 0 }}>
        {narrative}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

      {/* 리스크 배지 (항상 최상단) */}
      {(riskScore !== undefined && riskScore > 0) || riskLevel ? (
        <RiskBadge riskScore={riskScore} riskLevel={riskLevel} riskRaw={parsed.riskRaw} />
      ) : null}

      {/* ── Format A (▶ 섹션) ── */}
      {hasFormatA && (
        <>
          {parsed.coreAnswer && <CoreAnswerCard text={parsed.coreAnswer} />}
          {parsed.scenarios && <ScenariosCard text={parsed.scenarios} />}

          {/* 로드맵 + 법령 2열 그리드 */}
          {(parsed.roadmap && parsed.roadmap.length > 0) || (parsed.statutes && parsed.statutes.length > 0) ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "12px",
              }}
            >
              {parsed.roadmap && parsed.roadmap.length > 0 && (
                <RoadmapStepper steps={parsed.roadmap} />
              )}
              {parsed.statutes && parsed.statutes.length > 0 && (
                <StatutesCard items={parsed.statutes} />
              )}
            </div>
          ) : null}

          {parsed.precedents && parsed.precedents.length > 0 && (
            <PrecedentsCard items={parsed.precedents} />
          )}
          {parsed.lawyerNote && <LawyerNoteCard text={parsed.lawyerNote} />}
        </>
      )}

      {/* ── Format B ([] 섹션) ── */}
      {hasFormatB && (
        <>
          {parsed.situationDiagnosis && <SituationCard text={parsed.situationDiagnosis} />}

          {/* 법령 근거 + 변호사 조언 2열 */}
          {parsed.legalBasis || parsed.lawyerNote ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              {parsed.legalBasis && <LegalBasisCard text={parsed.legalBasis} />}
              {parsed.lawyerNote && <LawyerNoteCard text={parsed.lawyerNote} />}
            </div>
          ) : null}

          {parsed.recommendedActions && parsed.recommendedActions.length > 0 && (
            <ActionsCard items={parsed.recommendedActions} />
          )}
        </>
      )}

      {/* 면책 문구 */}
      <p
        style={{
          fontSize: "11px",
          color: "#3a3a5a",
          lineHeight: 1.8,
          fontStyle: "italic",
          paddingTop: "10px",
          borderTop: "0.5px solid #1a1a2e",
          margin: 0,
        }}
      >
        본 분석은 국가법령정보 API 기반의 AI 자동 분석으로, 법적 효력이 없습니다.
        구체적인 사안은 반드시 전문 법률가의 조언을 받으시기 바랍니다.
      </p>
    </div>
  );
}
