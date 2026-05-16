"use client";

/**
 * ContextBar.tsx
 * ──────────────────────────────────────────────────────────────────
 * 기관·직위 맞춤 설정 바
 *  - 처음 접속 시 펼쳐짐, 저장 후 접힘 (언제든 수정 가능)
 *  - 설정값 localStorage "lexguard_ctx" 에 저장
 *  - 선택된 항목: 사이안 테두리 강조
 *  - 저장 시 토스트 알림
 */

import React, { useEffect, useState, useCallback } from "react";
import { Settings, ChevronDown, ChevronUp, Check } from "lucide-react";

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

export const STORAGE_KEY = "lexguard_ctx";

export type UserContext = {
  orgType: string;
  position: string;
};

const ORG_TYPES: { key: string; emoji: string }[] = [
  { key: "중앙부처·청", emoji: "🏛" },
  { key: "광역시도·지자체", emoji: "🗺" },
  { key: "공기업·공공기관", emoji: "🏢" },
  { key: "교육기관·교육청", emoji: "🎓" },
  { key: "군·경찰·소방", emoji: "🛡" },
];

const POSITIONS: { key: string; sub: string }[] = [
  { key: "실무자", sub: "주무관·연구원·직원" },
  { key: "중간관리자", sub: "팀장·과장·계장" },
  { key: "고위직", sub: "부장·국장·임원·기관장" },
];

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function readStorage(): UserContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserContext) : null;
  } catch {
    return null;
  }
}

function writeStorage(ctx: UserContext) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
}

// ─────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────

function Toast({ msg }: { msg: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "28px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 20px",
        borderRadius: "99px",
        background: "rgba(10,22,40,0.95)",
        border: "1px solid rgba(0,200,200,0.5)",
        boxShadow: "0 4px 24px rgba(0,200,200,0.2)",
        fontSize: "13px",
        fontWeight: 700,
        color: "#7dd3fc",
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      <Check style={{ width: "14px", height: "14px", color: "#4ade80", flexShrink: 0 }} />
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SelectChip
// ─────────────────────────────────────────────────────────────────

function SelectChip({
  label,
  sub,
  prefix,
  active,
  onClick,
}: {
  label: string;
  sub?: string;
  prefix?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        padding: sub ? "8px 14px" : "7px 14px",
        borderRadius: "10px",
        border: active
          ? "1.5px solid #00c8c8"
          : "1.5px solid rgba(255,255,255,0.1)",
        background: active
          ? "rgba(0,200,200,0.08)"
          : "rgba(255,255,255,0.03)",
        cursor: "pointer",
        transition: "border-color 0.15s, background 0.15s",
        textAlign: "left",
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: "13px",
          fontWeight: 800,
          color: active ? "#7dd3fc" : "rgba(240,240,250,0.75)",
          lineHeight: 1.3,
          display: "flex",
          alignItems: "center",
          gap: "5px",
        }}
      >
        {prefix && <span style={{ fontSize: "14px" }}>{prefix}</span>}
        {label}
        {active && (
          <Check
            style={{
              width: "11px",
              height: "11px",
              color: "#00c8c8",
              flexShrink: 0,
            }}
          />
        )}
      </span>
      {sub && (
        <span
          style={{
            fontSize: "10.5px",
            fontWeight: 600,
            color: active ? "#22d3ee" : "#475569",
            lineHeight: 1.3,
            marginTop: "2px",
          }}
        >
          {sub}
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// ContextBar
// ─────────────────────────────────────────────────────────────────

export default function ContextBar() {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [orgType, setOrgType] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [toast, setToast] = useState<string | null>(null);
  const [saved, setSaved] = useState<UserContext | null>(null);

  // 마운트 후 localStorage 읽기
  useEffect(() => {
    setMounted(true);
    const ctx = readStorage();
    if (ctx) {
      setOrgType(ctx.orgType);
      setPosition(ctx.position);
      setSaved(ctx);
      setExpanded(false); // 이미 설정되어 있으면 접힘
    } else {
      setExpanded(true); // 처음 방문 → 펼침
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, []);

  const handleSave = useCallback(() => {
    const org = orgType || "공공기관 일반";
    const pos = position || "일반 공직자";
    const ctx: UserContext = { orgType: org, position: pos };
    writeStorage(ctx);
    setSaved(ctx);
    setExpanded(false);
    showToast(`✓ ${org} · ${pos}(으)로 설정됐습니다`);
  }, [orgType, position, showToast]);

  const handleReset = useCallback(() => {
    setOrgType("");
    setPosition("");
    setSaved(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    setExpanded(true);
  }, []);

  if (!mounted) return null;

  return (
    <>
      {/* ── 설정 바 ── */}
      <div
        className="glass"
        style={{
          borderRadius: "16px",
          border: saved
            ? "1px solid rgba(0,200,200,0.25)"
            : "1px solid rgba(255,255,255,0.1)",
          overflow: "hidden",
          transition: "border-color 0.2s",
        }}
      >
        {/* Header row */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "12px 16px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Settings
            style={{
              width: "15px",
              height: "15px",
              color: saved ? "#00c8c8" : "#64748b",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            {saved ? (
              <p
                style={{
                  fontSize: "12.5px",
                  fontWeight: 800,
                  color: "#7dd3fc",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                <span style={{ color: "#4ade80" }}>✓</span>{" "}
                {saved.orgType} · {saved.position} 맞춤 설정 적용 중
              </p>
            ) : (
              <p
                style={{
                  fontSize: "12.5px",
                  fontWeight: 700,
                  color: "#64748b",
                  margin: 0,
                }}
              >
                맞춤 설정으로 더 정확한 답변을 받으세요 — 기관·직위를 선택해 주세요
              </p>
            )}
          </div>
          {expanded ? (
            <ChevronUp style={{ width: "14px", height: "14px", color: "#475569", flexShrink: 0 }} />
          ) : (
            <ChevronDown style={{ width: "14px", height: "14px", color: "#475569", flexShrink: 0 }} />
          )}
        </button>

        {/* Expanded body */}
        {expanded && (
          <div
            style={{
              padding: "0 16px 16px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {/* ── 기관 유형 ── */}
            <div style={{ marginTop: "14px" }}>
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  color: "#2e3f60",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  margin: "0 0 8px",
                }}
              >
                기관 유형
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                {ORG_TYPES.map(({ key, emoji }) => (
                  <SelectChip
                    key={key}
                    label={key}
                    prefix={emoji}
                    active={orgType === key}
                    onClick={() => setOrgType((prev) => (prev === key ? "" : key))}
                  />
                ))}
              </div>
            </div>

            {/* ── 직위 수준 ── */}
            <div style={{ marginTop: "14px" }}>
              <p
                style={{
                  fontSize: "10px",
                  fontWeight: 800,
                  color: "#2e3f60",
                  letterSpacing: "0.13em",
                  textTransform: "uppercase",
                  margin: "0 0 8px",
                }}
              >
                직위 수준
              </p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                }}
              >
                {POSITIONS.map(({ key, sub }) => (
                  <SelectChip
                    key={key}
                    label={key}
                    sub={sub}
                    active={position === key}
                    onClick={() => setPosition((prev) => (prev === key ? "" : key))}
                  />
                ))}
              </div>
            </div>

            {/* ── Actions ── */}
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <button
                type="button"
                onClick={handleSave}
                style={{
                  padding: "8px 20px",
                  borderRadius: "10px",
                  background: "linear-gradient(to right,#0284c7,#7c3aed)",
                  border: "none",
                  color: "#fff",
                  fontSize: "12.5px",
                  fontWeight: 900,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                <Check style={{ width: "13px", height: "13px" }} />
                설정 완료
              </button>

              {saved && (
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: "7px 14px",
                    borderRadius: "10px",
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#64748b",
                    fontSize: "11.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  초기화
                </button>
              )}

              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#475569",
                  margin: 0,
                }}
              >
                {!orgType && !position
                  ? "선택 없으면 일반 공직자 기준 적용"
                  : `${orgType || "기관 미선택"} · ${position || "직위 미선택"}`}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} />}
    </>
  );
}
