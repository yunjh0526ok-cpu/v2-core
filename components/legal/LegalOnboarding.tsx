"use client";

import React from "react";

interface LegalOnboardingProps {
  onStart?: () => void;
}

const steps = [
  { num: 1, title: "질문 입력", desc: "상황을 한 줄로", bg: "#0d1f35", color: "#88bbff" },
  { num: 2, title: "법령 분석", desc: "API + Gemini 분석", bg: "#0d1f14", color: "#77cc88" },
  { num: 3, title: "카드 결과", desc: "판례 · 로드맵", bg: "#1f160a", color: "#ffbb55" },
  { num: 4, title: "PDF 저장", desc: "전체 다운로드", bg: "#1a0d2e", color: "#bb88ff" },
];

const exampleQuestions = [
  "부당해고 구제 방법은?",
  "임대차 계약 해지 통보 기간",
  "공익신고자 신분 보호 범위",
  "손해배상 소멸시효",
  "직장 내 괴롭힘 신고 절차",
  "퇴직금 미지급 대응",
];

const previewCards = [
  {
    key: "blue",
    label: "핵심 답변",
    title: "부당해고 구제 방법",
    body: "해고일로부터 3개월 이내 관할 지방노동위원회에 구제신청서 제출",
    tag: "근로기준법 제28조",
    bg: "#0d1f35", border: "#1a3a5c",
    lblColor: "#5599dd", titleColor: "#88bbff",
    bodyColor: "#5577aa", tagBg: "#1a3a5c", tagColor: "#88bbff",
  },
  {
    key: "green",
    label: "관련 판례",
    title: "대법원 2019다12345",
    body: "서면 통지 누락만으로 부당해고 인정 — 절차적 하자가 핵심",
    tag: "승소 사례",
    bg: "#0d1f14", border: "#1a3d22",
    lblColor: "#44aa66", titleColor: "#77cc88",
    bodyColor: "#447755", tagBg: "#1a3d22", tagColor: "#77cc88",
  },
  {
    key: "amber",
    label: "실행 로드맵",
    title: "오늘 → 1주 → 1개월",
    body: "해고통지서 확보 → 노동위원회 상담 → 구제신청서 접수",
    tag: "리스크 26% LOW",
    bg: "#1f160a", border: "#3d2a0e",
    lblColor: "#cc8833", titleColor: "#ffbb55",
    bodyColor: "#886644", tagBg: "#3d2a0e", tagColor: "#ffbb55",
  },
];

export default function LegalOnboarding({ onStart }: LegalOnboardingProps) {
  return (
    <div style={{
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      background: "#0f1117",
      borderRadius: "16px",
      padding: "2.5rem 2rem 2rem",
      color: "#e8e8f0",
    }}>

      {/* 타이틀 */}
      <p style={{ fontSize: "20px", fontWeight: 700, color: "#f0f0fa", margin: "0 0 8px", letterSpacing: "-0.3px" }}>
        AI 법률 분석, 이렇게 작동합니다
      </p>
      <p style={{ fontSize: "13px", color: "#8888aa", margin: "0 0 2rem", lineHeight: 1.7 }}>
        질문 하나로 법령 · 판례 · 실행 로드맵까지 한번에<br />
        국가법령정보 API + Gemini LLM 하이브리드 실시간 분석
      </p>

      {/* 4단계 스텝 */}
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "2rem" }}>
        {steps.map((step, i) => (
          <React.Fragment key={step.num}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{
                width: "34px", height: "34px", borderRadius: "50%",
                background: step.bg, color: step.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "13px", fontWeight: 700, marginBottom: "10px", flexShrink: 0,
              }}>
                {step.num}
              </div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#d0d0e8", marginBottom: "4px" }}>
                {step.title}
              </div>
              <div style={{ fontSize: "11px", color: "#666688", lineHeight: 1.5, padding: "0 2px" }}>
                {step.desc}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ paddingTop: "17px", color: "#333355", fontSize: "20px", flexShrink: 0, margin: "0 2px" }}>›</div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* 예시 질문 칩 */}
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#555577", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
        이런 질문을 해보세요
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "1.75rem" }}>
        {exampleQuestions.map((q) => (
          <span
            key={q}
            onClick={onStart}
            style={{
              fontSize: "11px", padding: "5px 11px", borderRadius: "20px",
              background: "#1a1a2e", border: "0.5px solid #2a2a4e",
              color: "#8888bb", cursor: "pointer",
            }}
          >
            {q}
          </span>
        ))}
      </div>

      {/* 미리보기 카드 */}
      <p style={{ fontSize: "11px", fontWeight: 700, color: "#555577", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 10px" }}>
        결과 미리보기
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "10px", marginBottom: "1.5rem" }}>
        {previewCards.map((card) => (
          <div key={card.key} style={{ background: card.bg, border: `0.5px solid ${card.border}`, borderRadius: "12px", padding: "14px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: card.lblColor, marginBottom: "8px" }}>
              {card.label}
            </div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: card.titleColor, marginBottom: "6px", lineHeight: 1.4 }}>
              {card.title}
            </div>
            <div style={{ fontSize: "11px", color: card.bodyColor, lineHeight: 1.65 }}>
              {card.body}
            </div>
            <div style={{ display: "inline-block", fontSize: "10px", padding: "3px 8px", borderRadius: "4px", marginTop: "10px", fontWeight: 700, background: card.tagBg, color: card.tagColor }}>
              {card.tag}
            </div>
          </div>
        ))}
      </div>

      {/* 시작 버튼 */}
      <button
        onClick={onStart}
        style={{
          width: "100%", padding: "13px", borderRadius: "10px",
          border: "1.5px solid #3366cc", background: "#0d1f3d",
          color: "#88bbff", fontSize: "14px", fontWeight: 700,
          cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.2px",
        }}
      >
        지금 질문하기 →
      </button>

      {/* 면책 문구 */}
      <p style={{
        fontSize: "11px", color: "#444466", lineHeight: 1.8, fontStyle: "italic",
        paddingTop: "1.25rem", borderTop: "0.5px solid #1a1a2e", margin: "1.25rem 0 0",
      }}>
        본 분석은 국가법령정보 API 기반의 AI 자동 분석으로, 법적 효력이 없습니다.<br />
        구체적인 사안은 반드시 전문 법률가의 조언을 받으시기 바랍니다.
      </p>
    </div>
  );
}
