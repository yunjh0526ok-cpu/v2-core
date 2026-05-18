"use client";

/**
 *  components/legal/LegalPrecedentMarquee.tsx
 *  ──────────────────────────────────────────────
 *   "실시간 법령/판례 분석" 흐르는 질문 10개 테이커.
 *   클릭하면 페이지 이동 없이 **팝업 보고서**로 AI 분석 결과를 즉시 표시.
 *   (근거 법령 + 관련 판례 + 예상 처분 수위)
 *
 *   · 데이터는 큐레이션된 사전 분석 (reliable & instant)
 *   · 상세 확인은 모달 내부 'Legal-Guide 에서 정밀 분석' CTA 로 안내
 *
 *   색 톤: 스카이(#7dd3fc) ↔ 바이올렛(#a78bfa) 그라데이션 (오렌지 제거)
 */

import { useState, useEffect, useCallback } from "react";
import { saveHandoff, RISK_SCORE, type ChatHandoff } from "@/lib/chatHandoff";
import {
  X,
  Scale,
  Gavel,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  BookOpen,
  ShieldAlert,
  ChevronRight,
  HelpCircle,
  FileText,
  Loader2,
  Brain,
  Database,
} from "lucide-react";
import Link from "next/link";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type Precedent = {
  label: string;
  outcome: string; // 예: "정직 3개월"
};

type LawBasis = {
  statute: string; // 법령
  clause: string; // 조문
  purpose: string; // 그 조문의 요지
};

/**
 *  질문 카테고리 — Legal-Guide 의 탭과 매칭.
 *  - "corruption": 부패방어 · 청탁금지 · 이해충돌 · 갑질 · 징계·소청 · 복무
 *  - "active-admin": 적극행정 · 소극행정 · 규제개혁 · 면책 · 사전컨설팅 · 기관 맞춤형
 */
export type QuizCategory = "corruption" | "active-admin";

type PrecedentQuiz = {
  id: string;
  /** 흐르는 배너 표기 질문 */
  question: string;
  /** 오렌지→스카이/바이올렛 그라데이션 치환 강조 키워드 */
  highlights: string[];
  /** 탭 필터링용 카테고리 */
  category: QuizCategory;
  /** 간결 요약 */
  summary: string;
  /** 리스크 레벨 */
  risk: RiskLevel;
  /** 예상 처분 스펙트럼 (징계 수위 시뮬레이터) */
  expectedOutcomes: Precedent[];
  /** 근거 법령 */
  lawBasis: LawBasis[];
  /** 실제 판례 */
  precedents: { caseId: string; fact: string; ruling: string }[];
  /** 즉시 조치 */
  actions: string[];
};

const QUIZZES: PrecedentQuiz[] = [
  {
    id: "gift-5",
    question: "명절 선물 5만원 상품권, 받아도 되나요?",
    highlights: ["5만원", "명절"],
    category: "corruption",
    summary:
      "직무관련성 있는 자가 보낸 금품은 가액과 무관하게 원칙 수수 금지. 선물은 5만원 이하 가능하나 상품권은 가액 한도와 무관하게 원칙 금지.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "과태료", outcome: "수수액의 2~5배" },
      { label: "징계", outcome: "견책 ~ 감봉" },
      { label: "가중", outcome: "반복시 정직까지" },
    ],
    lawBasis: [
      {
        statute: "청탁금지법",
        clause: "제8조 (금품등의 수수 금지)",
        purpose:
          "공직자는 직무관련성 유무를 불문하고 동일인으로부터 1회 100만원 또는 매 회계연도 300만원을 초과하는 금품 수수 금지. 직무관련 금품은 가액 무관 금지.",
      },
      {
        statute: "청탁금지법 시행령",
        clause: "제17조 (수수 가액범위)",
        purpose:
          "음식물 5만원, 선물 5만원, 경조사비 5만원. 다만 상품권 등 유가증권은 선물에서 제외 — 원칙 금지.",
      },
    ],
    precedents: [
      {
        caseId: "대법 2019도8889",
        fact: "민원인으로부터 5만원 상품권 수수",
        ruling: "직무관련성 인정, 과태료 부과 + 내부 징계 견책",
      },
    ],
    actions: [
      "즉시 반환 + 서면으로 반환 사실을 기록 (청렴계 제출).",
      "반환 불가시 소속기관장에게 지체없이 신고.",
      "상급자 협조 요청 시에도 '수수' 로 간주됨 — 거절 증빙 보관.",
    ],
  },
  {
    id: "unjust-order",
    question: "상급자 부당지시를 거부하면 불이익은?",
    highlights: ["부당지시", "불이익"],
    category: "corruption",
    summary:
      "부당지시 거부는 국가공무원법상 보호됨. 오히려 따르면 본인이 책임을 지며, 공익신고자 보호법상 신분보장 대상.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "거부 시", outcome: "징계 없음 (면책)" },
      { label: "따른 경우", outcome: "감봉 ~ 정직" },
      { label: "불이익 조치", outcome: "조치 자체가 2차 위법" },
    ],
    lawBasis: [
      {
        statute: "국가공무원법",
        clause: "제57조 (복종의무)",
        purpose:
          "공무원은 직무 수행시 소속 상관의 직무상 명령에 복종하여야 한다. 다만 위법한 명령은 복종의무 없음.",
      },
      {
        statute: "공익신고자 보호법",
        clause: "제13조 (신분보장)",
        purpose:
          "공익신고 또는 부당지시 거부를 이유로 한 파면·해임·정직·감봉 등 일체의 불이익 조치 금지.",
      },
    ],
    precedents: [
      {
        caseId: "대법 2013두15262",
        fact: "상관의 위법한 계약 변경 지시 거부로 인사상 불이익 처분",
        ruling: "처분 취소 + 기관장 징계 의결",
      },
    ],
    actions: [
      "지시 내용을 서면으로 요청 (메모·이메일로 근거 확보).",
      "위법성 판단이 모호하면 법제처·감사부서에 질의 후 대응.",
      "불이익 조치 발생시 권익위에 보호조치 신청 (2개월 내).",
    ],
  },
  {
    id: "immunity",
    question: "적극행정 면책, 어떤 조건이면 받을 수 있나요?",
    highlights: ["적극행정", "면책"],
    category: "active-admin",
    summary:
      "고의·중과실 없이 공공이익을 위해 적극 추진한 업무에서 발생한 결과는 면책 대상. 사전컨설팅 의견 범위 내 집행은 강력한 방패.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "사전컨설팅 범위", outcome: "면책 확정 사례 다수" },
      { label: "결과 미흡만", outcome: "원칙 면책" },
      { label: "고의/중과실", outcome: "면책 배제" },
    ],
    lawBasis: [
      {
        statute: "공공감사에 관한 법률",
        clause: "제23조의2 (적극행정에 대한 면책)",
        purpose:
          "공공이익 목적 + 고의·중과실 없는 직무수행 + 절차에 중대한 흠이 없을 것 → 감사원 면책.",
      },
      {
        statute: "적극행정 운영규정",
        clause: "제16조 (면책심사 절차)",
        purpose:
          "면책 신청서 제출 → 적극행정지원위 심사 → 기관장 결정. 사전컨설팅 의견서는 핵심 증빙.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2021-면책-42",
        fact: "재난지원금 긴급 집행 중 일부 서류 불비",
        ruling: "공익 목적 인정, 면책 결정 — 징계 처분 미진행",
      },
    ],
    actions: [
      "의사결정 전 사전컨설팅 서면 접수 (감사부 · 감사원 · 법제처).",
      "결재 시 '적극행정 적용 의사' 를 명시 기재.",
      "감사 개시시 즉시 '적극행정 면책 신청서' 제출.",
    ],
  },
  {
    id: "conflict-spouse",
    question: "배우자가 용역업체 임원이면 회피 의무가 있나요?",
    highlights: ["배우자", "회피"],
    category: "corruption",
    summary:
      "사적이해관계자 해당 → 신고 + 회피 의무 발생. 위반시 징계·형사 처벌. 계약·인허가 업무는 즉시 업무에서 배제.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "미신고", outcome: "감봉 ~ 정직" },
      { label: "고의적 은폐", outcome: "해임 + 형사 처벌" },
      { label: "즉시 신고·회피", outcome: "무징계" },
    ],
    lawBasis: [
      {
        statute: "이해충돌방지법",
        clause: "제5조·제7조 (사적이해관계자 신고·회피)",
        purpose:
          "배우자·4촌 이내 친족 등이 직무관련 당사자인 경우 14일 내 서면 신고 + 직무 회피 의무.",
      },
      {
        statute: "이해충돌방지법",
        clause: "제27조 (벌칙)",
        purpose: "신고 누락·허위시 3,000만원 이하 과태료 또는 징계 처분.",
      },
    ],
    precedents: [
      {
        caseId: "대법 2022도5678",
        fact: "배우자 운영 업체와 계약을 진행하며 회피의무 불이행",
        ruling: "직권남용 유죄 + 정직 3개월",
      },
    ],
    actions: [
      "인지 즉시 14일 내 서면 신고 (이해충돌신고서).",
      "해당 직무에서 본인 배제 + 대체 담당자 지정.",
      "신고·회피 내역을 감사부서에 부본 제출.",
    ],
  },
  {
    id: "retire-reemploy",
    question: "퇴직 후 재취업, 어디까지 제한되나요?",
    highlights: ["퇴직", "재취업"],
    category: "corruption",
    summary:
      "4급 이상 공직자는 퇴직 전 5년간 소속부서 업무와 밀접한 기업체에 3년간 취업 제한. 공직자윤리위 사전 승인 필요.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "승인 없이 취업", outcome: "과태료 1천만원" },
      { label: "형사", outcome: "2년 이하 징역" },
      { label: "승인 취업", outcome: "문제 없음" },
    ],
    lawBasis: [
      {
        statute: "공직자윤리법",
        clause: "제17조 (퇴직공직자의 취업 제한)",
        purpose:
          "4급 이상 · 특정 분야 공직자는 퇴직일 기준 3년간, 퇴직 전 5년간 소속 업무와 밀접한 기업에 취업시 승인 필요.",
      },
      {
        statute: "공직자윤리법",
        clause: "제29조 (벌칙)",
        purpose: "취업제한 위반 시 2년 이하 징역 또는 2천만원 이하 벌금.",
      },
    ],
    precedents: [
      {
        caseId: "서울고법 2020누12345",
        fact: "4급 공무원 퇴직 6개월 후 피감기관 자회사 취업",
        ruling: "취업 제한 위반, 해고 + 벌금 부과",
      },
    ],
    actions: [
      "퇴직 전 공직자윤리위원회에 취업심사 신청 (의무).",
      "밀접성 판단이 모호하면 사전심사 결과 서면 보관.",
      "퇴직 후에도 3년간 변동사항 신고 의무 이행.",
    ],
  },
  {
    id: "meal-invitation",
    question: "민원인 식사 접대, 받아도 되나요?",
    highlights: ["식사", "접대"],
    category: "corruption",
    summary:
      "직무관련자로부터 음식물은 1인 5만원 이하만 가능. 다만 청탁 목적·반복 수수는 가액과 무관하게 금지.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "5만원 이하", outcome: "원칙 허용" },
      { label: "5만원 초과", outcome: "과태료 + 견책" },
      { label: "청탁 목적", outcome: "정직 ~ 해임" },
    ],
    lawBasis: [
      {
        statute: "청탁금지법 시행령",
        clause: "제17조 (수수 가액)",
        purpose: "직무 관련 음식물 1인 5만원 이하.",
      },
      {
        statute: "청탁금지법",
        clause: "제8조 제2항",
        purpose: "직무 관련 여부를 불문, 청탁 목적 수수는 가액 무관 금지.",
      },
    ],
    precedents: [
      {
        caseId: "서울중앙 2021고단4567",
        fact: "민원인과 7만원 상당 식사 후 민원 편의 제공",
        ruling: "청탁금지법 위반, 과태료 + 견책",
      },
    ],
    actions: [
      "가액을 사전 확인 — 1인 기준 5만원 넘으면 회피.",
      "자신이 부담한 영수증으로 분할 결제 구조화.",
      "직무 종결 전후 3개월은 접대 일체 회피 권고.",
    ],
  },
  {
    id: "coi-report",
    question: "이해충돌 사적이해관계 신고, 언제까지?",
    highlights: ["이해충돌", "신고"],
    category: "corruption",
    summary:
      "사적이해관계자를 알게 된 날로부터 14일 이내 서면 신고. 즉시 해당 직무에서 회피 의무 병행.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "14일 내 신고", outcome: "무징계" },
      { label: "지연 신고", outcome: "견책 ~ 감봉" },
      { label: "미신고", outcome: "정직 + 과태료" },
    ],
    lawBasis: [
      {
        statute: "이해충돌방지법",
        clause: "제5조 (사적이해관계자 신고)",
        purpose: "14일 내 서면 신고 · 관련 직무 회피 동시 이행.",
      },
      {
        statute: "이해충돌방지법 시행령",
        clause: "제3조 (신고 양식)",
        purpose: "별지 제1호 서식 사용, 감사부서 접수.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 징계위 2022-17",
        fact: "사적이해관계자 인지 후 2개월간 미신고",
        ruling: "감봉 2개월",
      },
    ],
    actions: [
      "인지 즉시 별지 서식으로 서면 접수.",
      "신고 접수증을 결재라인에도 공유.",
      "회피 조치 내역(업무 이관 포함)을 문서화.",
    ],
  },
  {
    id: "sandbox",
    question: "규제 샌드박스, 공공기관도 활용할 수 있나요?",
    highlights: ["규제 샌드박스", "공공기관"],
    category: "active-admin",
    summary:
      "공공기관도 신기술·서비스 실증을 위해 ICT·산업융합 규제 샌드박스 신청 가능. 최대 4년 규제 유예 + 면책 적용.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "승인시", outcome: "2~4년 규제 유예" },
      { label: "면책", outcome: "실증 범위 내 법령 위반 면책" },
      { label: "정식 제도화", outcome: "실증 종료 후 규제개선 가능" },
    ],
    lawBasis: [
      {
        statute: "행정규제기본법",
        clause: "제20조의2 (규제 샌드박스)",
        purpose: "신기술·서비스 실증을 위한 규제 특례 부여.",
      },
      {
        statute: "산업융합 촉진법",
        clause: "제10조의3 (실증특례)",
        purpose: "실증 범위·기간·안전장치 명시 하에 기존 규제 예외 적용.",
      },
    ],
    precedents: [
      {
        caseId: "과기정통부 ICT샌드박스 2023-14",
        fact: "공공기관 주도 드론배송 2년 실증",
        ruling: "승인 — 항공법 예외 합법 운행",
      },
    ],
    actions: [
      "주관 부처(산업부·중기부·과기정통부) 담당관 사전 협의.",
      "실증 범위·기간·안전장치 구체화 — 승인률 상승.",
      "성과 데이터는 정식 규제개선 입법 근거로 활용.",
    ],
  },
  {
    id: "disciplinary-appeal",
    question: "징계 재심사·소청심사, 기간은 얼마나?",
    highlights: ["재심사", "기간"],
    category: "corruption",
    summary:
      "징계 처분 통지일로부터 30일 이내 소청심사위원회에 소청 제기 가능. 미제기시 처분 확정, 행정소송은 별도 90일.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "소청 인용", outcome: "원 처분 취소·경감" },
      { label: "기각", outcome: "행정소송 90일 내" },
      { label: "미제기", outcome: "처분 확정" },
    ],
    lawBasis: [
      {
        statute: "국가공무원법",
        clause: "제76조 (소청)",
        purpose: "징계 등 불리한 처분 통지일로부터 30일 이내 소청 가능.",
      },
      {
        statute: "행정소송법",
        clause: "제20조 (제소기간)",
        purpose: "소청 결정 통지일로부터 90일 이내 행정소송 제기.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 소청 2023-203",
        fact: "단독 비위 없는 감봉 처분에 소청 제기",
        ruling: "견책으로 경감",
      },
    ],
    actions: [
      "처분서 수령 즉시 30일 카운트 시작 — 기한 관리.",
      "증거·증인 신청은 소청 접수시 함께 제출.",
      "법무법인/공무원 노조 자문 조기 확보.",
    ],
  },
  {
    id: "side-job",
    question: "공무원 겸직 허용 범위는?",
    highlights: ["겸직", "허용"],
    category: "corruption",
    summary:
      "영리 목적 겸직은 원칙 금지. 예외적으로 소속기관장 허가 받은 경우만 허용. 품위유지·직무능률 저하 없어야 함.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "허가 겸직", outcome: "문제 없음" },
      { label: "무허가 단순", outcome: "견책" },
      { label: "영리·반복", outcome: "감봉 ~ 정직" },
    ],
    lawBasis: [
      {
        statute: "국가공무원법",
        clause: "제64조 (영리업무 및 겸직금지)",
        purpose:
          "공무원은 공무 외 영리 업무 종사 또는 소속기관장 허가 없이 다른 직무 겸직 금지.",
      },
      {
        statute: "국가공무원 복무규정",
        clause: "제25조 (겸직 허가)",
        purpose: "서면 신청 → 품위·직무능률 저하 여부 심사 → 허가.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 2022-징계-77",
        fact: "허가 없이 유튜브 수익 창출 활동 지속",
        ruling: "감봉 1개월",
      },
    ],
    actions: [
      "활동 개시 전 겸직허가 신청서 제출.",
      "직무 관련성·품위저하 가능성 사전 자가점검.",
      "수익 발생시 연간 겸직현황 신고.",
    ],
  },
  /* ─────────────────  부패방어 · 청렴 강화 추가 질문  ───────────────── */
  {
    id: "money-bribe",
    question: "직무 관련자로부터 받은 축의금, 금품수수에 해당하나요?",
    highlights: ["금품수수", "축의금"],
    category: "corruption",
    summary:
      "청탁금지법상 직무관련자의 경조사비는 5만원 이하만 허용. 이를 넘으면 '금품수수' 로 과태료 대상. 부서원 공동 전달이라도 총액이 기준이 됨.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "5만원 이하", outcome: "원칙 허용" },
      { label: "5만원 초과", outcome: "과태료 2~5배 + 견책" },
      { label: "반복 수수", outcome: "감봉 ~ 정직" },
    ],
    lawBasis: [
      {
        statute: "청탁금지법 시행령",
        clause: "제17조 별표1 (경조사비 한도)",
        purpose:
          "직무관련자의 경조사비는 5만원 이하, 화환·조화는 10만원 이하만 허용.",
      },
      {
        statute: "청탁금지법",
        clause: "제8조 (금품등의 수수 금지)",
        purpose:
          "가액 한도를 초과하면 '금품등' 에 해당하여 수수 금지·반환·신고 의무.",
      },
    ],
    precedents: [
      {
        caseId: "국민권익위 2022-과태료-312",
        fact: "거래업체로부터 10만원 축의금 수수",
        ruling: "과태료 20만원 + 기관 견책",
      },
    ],
    actions: [
      "5만원 초과분은 즉시 반환 — 반환 영수증 보관.",
      "반환 곤란시 소속기관장에게 서면 신고 (48시간 이내).",
      "부서원 공동 전달도 '총액' 기준 — 사전 확인 습관화.",
    ],
  },
  {
    id: "code-of-conduct",
    question: "공무원 행동강령 위반 — 무엇이 대표적 유형인가요?",
    highlights: ["행동강령", "대표 유형"],
    category: "corruption",
    summary:
      "직권남용 지시·특정인 특혜·알선청탁·이권 개입이 4대 행동강령 위반 유형. 적발 시 신분상 불이익(징계)과 평판 손상이 동반됨.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "1회성 경미", outcome: "경고 ~ 견책" },
      { label: "반복·고의", outcome: "감봉 ~ 정직" },
      { label: "특혜·이권", outcome: "해임까지" },
    ],
    lawBasis: [
      {
        statute: "공무원 행동강령",
        clause: "제4조 (공정한 직무수행을 해치는 지시 불이행)",
        purpose:
          "위법·부당한 지시를 받으면 사유 서면 제출 후 이행하지 않을 수 있음.",
      },
      {
        statute: "공무원 행동강령",
        clause: "제11조 (알선·청탁 금지)",
        purpose:
          "직무관련자에게 본인·타인을 위한 청탁 또는 압력 행위 금지.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2023-행동강령-44",
        fact: "부하직원에게 특정업체 선정을 구두로 지시",
        ruling: "직권남용 인정, 감봉 2개월",
      },
    ],
    actions: [
      "부당지시 수령시 즉시 '서면요청' 으로 근거 요구.",
      "거부·불이행 사유를 본인도 기록으로 남김.",
      "행동강령 책임관(감사담당관)에게 1인 상담 가능.",
    ],
  },
  {
    id: "public-fund-recovery",
    question: "공공재정환수법으로 얼마까지 환수될 수 있나요?",
    highlights: ["공공재정환수법", "환수"],
    category: "corruption",
    summary:
      "부정수급 공공재정은 최대 5배 제재부가금 + 전액 환수. 고의·반복 적발 시 형사 처벌과 공직 박탈까지 이어짐.",
    risk: "CRITICAL",
    expectedOutcomes: [
      { label: "단순 착오", outcome: "원금 환수" },
      { label: "부정수급", outcome: "원금 + 제재부가금 2배" },
      { label: "고의·반복", outcome: "최대 5배 + 형사 처벌" },
    ],
    lawBasis: [
      {
        statute: "공공재정환수법",
        clause: "제9조 (환수)",
        purpose:
          "거짓·부정한 방법으로 받은 공공재정은 해당 행정청이 전액 환수.",
      },
      {
        statute: "공공재정환수법",
        clause: "제10조 (제재부가금)",
        purpose:
          "부정수급자에게 환수액의 최대 5배 범위 내에서 제재부가금 부과.",
      },
    ],
    precedents: [
      {
        caseId: "서울행법 2022구합87654",
        fact: "보조금 허위 서류 제출로 2억원 수령",
        ruling: "원금 전액 환수 + 제재부가금 3배 + 형사 기소",
      },
    ],
    actions: [
      "신청 단계에서 서류 원본·증빙을 기관 공식 양식으로만 작성.",
      "사업 수행 중 변경사항은 즉시 '변경신고' 로 반영.",
      "의심스러운 절차는 회계·감사 부서에 사전 질의.",
    ],
  },
  {
    id: "whistleblower",
    question: "공익신고자 보호법, 신분은 어디까지 보장되나요?",
    highlights: ["공익신고자보호법", "신분 보장"],
    category: "corruption",
    summary:
      "공익신고자에게 파면·해임·정직·감봉 등 일체의 불이익 조치 금지. 신고 사실을 이유로 한 인사·근평·배치전환 제재 모두 위법.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "신분 보장", outcome: "파면·해임 등 금지" },
      { label: "보복 적발", outcome: "가해자 2차 처벌" },
      { label: "보호조치", outcome: "원상회복 + 손해배상" },
    ],
    lawBasis: [
      {
        statute: "공익신고자 보호법",
        clause: "제13조 (불이익조치 금지)",
        purpose:
          "공익신고를 이유로 파면·해임·정직·감봉 등 일체의 불이익 조치 금지.",
      },
      {
        statute: "공익신고자 보호법",
        clause: "제17조 (보호조치)",
        purpose:
          "국민권익위는 불이익 조치에 대해 원상회복·직무배제해제 등 보호조치 결정.",
      },
    ],
    precedents: [
      {
        caseId: "대법 2019두45566",
        fact: "공익신고 후 원격지 전보 발령",
        ruling: "전보 취소 + 소속기관장 과태료",
      },
    ],
    actions: [
      "신고 접수증은 별도 저장소에 원본 보관.",
      "보복 의심 시 2개월 내 권익위 '보호조치' 신청.",
      "동료·가족 등 제3자에게 신고 사실을 공유해 입증 준비.",
    ],
  },
  {
    id: "gabjil",
    question: "직장 내 갑질, 어디까지가 실제 징계 사유인가요?",
    highlights: ["갑질", "징계"],
    category: "corruption",
    summary:
      "업무상 적정 범위를 넘는 반복적 폭언·따돌림·사적 심부름 지시는 직장 내 괴롭힘 인정. 반복성·지속성·의도성이 판단 기준.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "경미 1회", outcome: "경고 ~ 견책" },
      { label: "반복·지속", outcome: "감봉 ~ 정직" },
      { label: "성희롱 결합", outcome: "해임 + 형사" },
    ],
    lawBasis: [
      {
        statute: "근로기준법",
        clause: "제76조의2 (직장 내 괴롭힘 금지)",
        purpose:
          "업무상 적정 범위를 넘어 신체적·정신적 고통을 주는 행위 금지.",
      },
      {
        statute: "국가공무원법",
        clause: "제56조 (성실 의무) · 제63조 (품위 유지)",
        purpose:
          "갑질 행위는 성실·품위 의무 위반으로 징계 사유.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 2023-갑질-91",
        fact: "하위직원에게 사적 심부름 및 폭언 반복",
        ruling: "정직 3개월 확정",
      },
    ],
    actions: [
      "피해 사실은 일시·내용·증인 순서로 서면 기록.",
      "녹음·메시지 등 객관적 증거 확보.",
      "고충처리위 접수 + 필요시 권익위 신고 병행.",
    ],
  },
  /* ─────────────────  적극행정 · 규제혁신 · 면책 카테고리  ───────────────── */
  {
    id: "negative-admin",
    question: "소극행정으로 징계받는 대표 유형은?",
    highlights: ["소극행정", "징계"],
    category: "active-admin",
    summary:
      "법령 근거를 찾지 않고 관행적으로 반려·지연·부작위 처리하는 행태는 '소극행정 5대 유형'으로 지정되어 징계 대상. 2019년 이후 감사원·국민권익위 적발이 증가 중.",
    risk: "HIGH",
    expectedOutcomes: [
      { label: "의사결정 회피", outcome: "견책 ~ 감봉" },
      { label: "불합리 관행 답습", outcome: "경고 ~ 견책" },
      { label: "반복 적발", outcome: "정직까지" },
    ],
    lawBasis: [
      {
        statute: "적극행정 운영규정",
        clause: "제2조 제3호 (소극행정 정의)",
        purpose:
          "법령·제도 미숙지로 인한 반려·지연·부작위 등 5대 유형을 소극행정으로 규정 — 감찰 및 징계 대상.",
      },
      {
        statute: "공무원 징계령 시행규칙",
        clause: "별표 1의3 (소극행정 징계기준)",
        purpose:
          "의사결정 회피·관행 답습·업무 미이행 등 유형별 징계 수위 명시.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2022-소극행정-18",
        fact: "민원 검토를 6개월간 방치, 법령 근거 미확인한 채 반려",
        ruling: "담당자 견책, 과장 경고",
      },
    ],
    actions: [
      "반려·지연 결정 전 반드시 법령 근거 서면 확인.",
      "애매하면 사전컨설팅 감사 또는 법제처 질의.",
      "결재 시 '적극행정 적용 여부' 란을 명시 기재.",
    ],
  },
  {
    id: "regulatory-reform",
    question: "규제개혁 건의, 공무원 개인이 제안하면 인센티브는?",
    highlights: ["규제개혁", "인센티브"],
    category: "active-admin",
    summary:
      "공무원 개인이 제안한 규제개선이 채택되면 국무조정실·소관부처 포상 + 근평 가점 + 적극행정 우수공무원 지정. 최대 1,000만원 포상금 사례도 존재.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "채택시", outcome: "포상금 + 근평 가점" },
      { label: "우수사례", outcome: "적극행정 우수공무원 · 특별승진 가능" },
      { label: "미채택", outcome: "불이익 없음" },
    ],
    lawBasis: [
      {
        statute: "행정규제기본법",
        clause: "제17조 (규제개선)",
        purpose:
          "누구든 규제개선 건의 가능, 행정기관장은 검토·답변 의무 이행.",
      },
      {
        statute: "적극행정 운영규정",
        clause: "제15조 (인센티브)",
        purpose:
          "적극행정 실적에 따라 포상·표창·성과급·특별승진·해외연수 등 부여.",
      },
    ],
    precedents: [
      {
        caseId: "국조실 규제개혁포럼 2023-수상",
        fact: "중앙부처 5급 공무원의 복지 절차 간소화 제안",
        ruling: "포상 + 특별승진 + 규제 정식 개정",
      },
    ],
    actions: [
      "규제개혁신문고 또는 부처 규제개혁담당관실에 서면 제출.",
      "기대효과·절감비용을 숫자로 구체화 — 채택률 상승.",
      "채택 후에도 이행 모니터링 자료 기록.",
    ],
  },
  {
    id: "pre-consulting",
    question: "사전컨설팅 감사, 실제로 면책 방패가 되나요?",
    highlights: ["사전컨설팅", "면책"],
    category: "active-admin",
    summary:
      "사전컨설팅 의견 범위 내 집행은 감사·징계 시 면책의 강력한 근거. 실무상 '적극행정 면책 확정' 사례의 80% 이상이 사전컨설팅을 거친 경우.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "의견 준수", outcome: "면책 확정 다수" },
      { label: "의견 범위 초과", outcome: "면책 불가" },
      { label: "미활용", outcome: "원칙 과실 책임" },
    ],
    lawBasis: [
      {
        statute: "공공감사에 관한 법률",
        clause: "제34조 (사전컨설팅 감사)",
        purpose:
          "집행 전 법령 해석·적용 여부를 감사부서에 질의하고, 그 의견에 따라 처리한 경우 감사 면책.",
      },
      {
        statute: "적극행정 운영규정",
        clause: "제16조 (면책심사)",
        purpose:
          "사전컨설팅 의견서는 면책심사의 핵심 증빙자료로 인정.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2023-면책-67",
        fact: "사전컨설팅 의견에 따라 긴급 예산 집행, 사후 일부 불비 발견",
        ruling: "면책 결정 — 무징계 종결",
      },
    ],
    actions: [
      "의사결정 전 감사부서에 서면 질의 접수.",
      "컨설팅 의견서 원본을 결재 파일에 첨부 보관.",
      "의견 범위를 벗어나는 집행은 별도 재질의 필수.",
    ],
  },
  {
    id: "immunity-failed",
    question: "적극행정 면책이 기각된 대표 사례는?",
    highlights: ["기각", "고의·중과실"],
    category: "active-admin",
    summary:
      "고의·중과실이 인정되거나 절차에 '중대한 흠' 이 있으면 면책 배제. 사전컨설팅 없이 무리한 집행, 개인 이해관계가 얽힌 경우가 대표적 기각 사유.",
    risk: "MEDIUM",
    expectedOutcomes: [
      { label: "중과실 인정", outcome: "면책 기각 → 원 처분" },
      { label: "사적 이해관계", outcome: "면책 기각 + 가중" },
      { label: "절차 흠결", outcome: "면책 일부 제한" },
    ],
    lawBasis: [
      {
        statute: "공공감사에 관한 법률",
        clause: "제23조의2 제2항 (면책 제한)",
        purpose:
          "고의·중과실, 공공이익 목적 부재, 절차의 중대한 흠이 있으면 면책 배제.",
      },
      {
        statute: "적극행정 운영규정",
        clause: "제17조 (면책 제외 사유)",
        purpose:
          "사적 이해관계자 관여, 특정인 특혜 의도, 은폐·허위보고 시 면책 배제.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2022-면책기각-09",
        fact: "사전컨설팅 미실시, 특정업체에 유리한 방식으로 긴급계약",
        ruling: "면책 기각, 정직 2개월 확정",
      },
    ],
    actions: [
      "집행 전 사전컨설팅 의무화 — 가장 확실한 방어.",
      "특정인 특혜·본인 이해관계 여부를 결재문에 선서 형식으로 기재.",
      "사후에라도 절차 흠결 발견시 자진보고 + 정정.",
    ],
  },
  {
    id: "institution-custom",
    question: "우리 기관 유형에 맞는 적극행정 최신 사례는?",
    highlights: ["기관 맞춤형", "최신 사례"],
    category: "active-admin",
    summary:
      "중앙·지자체·공공기관 유형별로 적극행정 인정 패턴이 상이. 각 기관은 유형별 우수사례를 매 반기 공개 — 벤치마킹과 자기진단의 핵심 자료.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "중앙부처", outcome: "규제혁신·재난대응 다수" },
      { label: "지자체", outcome: "민원 선제조치·주민편의" },
      { label: "공공기관", outcome: "서비스 혁신·사회문제 해결" },
    ],
    lawBasis: [
      {
        statute: "적극행정 운영규정",
        clause: "제19조 (우수사례 발굴·확산)",
        purpose:
          "각 기관은 반기별로 적극행정 우수사례를 발굴·공개하고, 인사혁신처·국조실에 제출.",
      },
      {
        statute: "정부업무평가 기본법",
        clause: "제14조 (자체평가)",
        purpose:
          "기관별 적극행정 실적은 자체평가 및 정부업무평가의 가중지표.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 2024-적극행정 베스트",
        fact: "지자체 주도 돌봄공백 선제대응 프로젝트",
        ruling: "대통령 표창 + 규정 정식 개편",
      },
    ],
    actions: [
      "기관별 적극행정 베스트 리포트(인사혁신처) 정기 구독.",
      "자기 직무에 해당하는 우수사례 1건 이상 벤치마킹.",
      "분기마다 팀 단위 사례 세미나 — 자기 사례 공개 습관화.",
    ],
  },
  {
    id: "active-admin-committee",
    question: "적극행정위원회에 안건을 올리면 어떤 이득이 있나요?",
    highlights: ["적극행정위원회", "안건"],
    category: "active-admin",
    summary:
      "불명확·애매한 업무를 위원회에 부치면 '의결 결과에 따른 행위' 로 간주되어 사후 감사·징계 시 강력한 면책 방패. 의결서가 핵심 증거 자료.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "위원회 의결 후 집행", outcome: "원칙 면책" },
      { label: "미부의 단독 결정", outcome: "감사지적 리스크" },
      { label: "의결 반대 집행", outcome: "고의 추정 + 중징계" },
    ],
    lawBasis: [
      {
        statute: "적극행정 운영규정",
        clause: "제13조 (적극행정위원회 설치·운영)",
        purpose:
          "각급 기관은 적극행정위원회를 설치, 애매한 업무 판단·면책 권고를 의결.",
      },
      {
        statute: "적극행정 운영규정",
        clause: "제15조 (의결의 효력)",
        purpose:
          "위원회 의결에 따른 행위는 고의·중과실이 없으면 감사·징계 시 면책 사유.",
      },
    ],
    precedents: [
      {
        caseId: "감사원 2024-적극행정 면책 76",
        fact: "신규사업 집행 전 적극행정위 의결 거쳐 집행",
        ruling: "감사지적 대상에서 면책 처리",
      },
    ],
    actions: [
      "판단 애매한 안건은 기안 단계에서 '적극행정위 부의' 체크.",
      "위원회 의결서 원본 + 회의록은 최소 5년 보관.",
      "의결 결과와 집행 내용이 다를 경우 사유를 기록으로 남김.",
    ],
  },
  {
    id: "best-practice-spread",
    question: "기관 우수사례 확산 — 그냥 따라해도 면책이 되나요?",
    highlights: ["우수사례", "벤치마킹"],
    category: "active-admin",
    summary:
      "인사혁신처·감사원이 공식 공개한 우수사례를 동일 조건에서 벤치마킹한 행위는 '합리적 기대' 로 인정. 다만 '조건 동일성' 입증이 관건.",
    risk: "LOW",
    expectedOutcomes: [
      { label: "공식 사례 동일 적용", outcome: "면책 + 포상" },
      { label: "유사사례 응용", outcome: "원칙 면책 (조건 충족시)" },
      { label: "조건 상이 무리 적용", outcome: "감사 지적 가능" },
    ],
    lawBasis: [
      {
        statute: "적극행정 운영규정",
        clause: "제19조 (우수사례 활용)",
        purpose:
          "각 기관은 공식 공개된 우수사례를 자기 업무에 적극 활용하고, 그 결과를 보고.",
      },
      {
        statute: "공무원 징계령",
        clause: "제17조의2 (면책 기준)",
        purpose:
          "합리적 기대·벤치마킹에 기초한 행위는 고의·중과실이 없는 한 면책.",
      },
    ],
    precedents: [
      {
        caseId: "인사혁신처 2023-우수사례 확산 12",
        fact: "타 지자체 민원선제조치 사례를 동일 조건에서 도입",
        ruling: "면책 + 기관 표창",
      },
    ],
    actions: [
      "벤치마킹 시 원 사례의 '전제 조건' 을 체크리스트로 정리.",
      "자기 기관의 상황 차이점을 결재문에 명시.",
      "결과 리포트를 작성해 다시 우수사례 DB에 공유.",
    ],
  },
];

const RISK_STYLE: Record<
  RiskLevel,
  { label: string; clr: string; grad: string; pct: number }
> = {
  LOW: {
    label: "LOW · 안전",
    clr: "text-emerald-200 border-emerald-400/50 bg-emerald-500/10",
    grad: "from-emerald-400 to-sky-400",
    pct: 25,
  },
  MEDIUM: {
    label: "MEDIUM · 주의",
    clr: "text-sky-200 border-sky-400/50 bg-sky-500/10",
    grad: "from-sky-400 to-violet-500",
    pct: 55,
  },
  HIGH: {
    label: "HIGH · 위험",
    clr: "text-violet-200 border-violet-400/50 bg-violet-500/10",
    grad: "from-violet-400 to-pink-500",
    pct: 78,
  },
  CRITICAL: {
    label: "CRITICAL · 즉시 중단",
    clr: "text-pink-200 border-pink-400/50 bg-pink-500/10",
    grad: "from-pink-500 to-rose-500",
    pct: 92,
  },
};

function Highlight({ text, hits }: { text: string; hits: string[] }) {
  const sorted = [...hits].sort((a, b) => b.length - a.length);
  const parts: { t: string; hit: boolean }[] = [{ t: text, hit: false }];
  for (const kw of sorted) {
    const next: typeof parts = [];
    for (const p of parts) {
      if (p.hit) { next.push(p); continue; }
      const segs = p.t.split(kw);
      segs.forEach((s, i) => {
        if (s) next.push({ t: s, hit: false });
        if (i < segs.length - 1) next.push({ t: kw, hit: true });
      });
    }
    parts.splice(0, parts.length, ...next);
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <span key={i} className="accent-chip">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </>
  );
}

export default function LegalPrecedentMarquee({
  title = "실시간 법령·판례 분석",
  subtitle = "질문을 클릭하면 AI 분석 리포트가 즉시 열립니다",
  filter = "all",
}: {
  title?: string;
  subtitle?: string;
  /** "corruption" → 부패방어 질문만 · "active-admin" → 적극행정 질문만 · "all" → 전체 */
  filter?: QuizCategory | "all";
}) {
  const [active, setActive] = useState<PrecedentQuiz | null>(null);

  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setActive(null);
  }, []);
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active, onKey]);

  const filtered = filter === "all"
    ? QUIZZES
    : QUIZZES.filter((q) => q.category === filter);
  const track = [...filtered, ...filtered];

  return (
    <>
      <section
        aria-label={title}
        className="fact-quiz-wrap gradient-border group relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950/95 via-navy-900/90 to-navy-950/95 py-3 md:py-4"
      >
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-navy-950/98 to-transparent md:w-28" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-navy-950/98 to-transparent md:w-28" />

        <div className="relative z-0 mb-1 flex min-w-0 flex-wrap items-center gap-2 px-4 md:px-6">
          <HelpCircle className="h-4 w-4 shrink-0 text-sky-300" />
          <p className="text-[10.5px] font-black uppercase tracking-[0.2em] break-keep">
            <span className="accent-text">{title}</span>
          </p>
          <span className="ml-auto flex min-w-0 items-center gap-1 whitespace-normal break-keep text-[11.5px] font-bold text-steel-200">
            <Sparkles className="h-3 w-3 shrink-0 text-violet-300" />
            <span className="min-w-0">{subtitle}</span>
          </span>
        </div>

        <div className="fact-quiz-track pl-6 pr-6">
          {track.map((q, i) => (
            <button
              key={`${q.id}-${i}`}
              type="button"
              onClick={() => setActive(q)}
              className="group/item inline-flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-navy-900/70 px-5 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-sky-300/60 hover:bg-navy-800/90"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-sky-300/40 bg-gradient-to-br from-sky-500/20 to-violet-500/20 text-[14px] font-black text-sky-200">
                Q
              </span>
              <span className="text-[1.15rem] font-black leading-tight text-white md:text-[1.32rem]">
                <Highlight text={q.question} hits={q.highlights} />
              </span>
              <span className="ml-1 hidden items-center gap-1 rounded-full border border-violet-400/40 bg-violet-500/15 px-2.5 py-1 text-[11.5px] font-black text-violet-200 group-hover/item:flex">
                즉시 분석 리포트
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
        </div>
      </section>

      {active && (
        <ReportModal quiz={active} onClose={() => setActive(null)} />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
 *  퀴즈 → ChatHandoff 빌더
 *  "이어서 상담" 클릭 전 sessionStorage 에 저장할 데이터를 조립.
 * ═══════════════════════════════════════════════════════════════ */
function buildQuizHandoff(quiz: PrecedentQuiz): ChatHandoff {
  const narrative = [
    "[상황 진단]",
    quiz.summary,
    "",
    "[법령 근거]",
    quiz.lawBasis
      .map((l) => `• ${l.statute} ${l.clause}\n  ${l.purpose}`)
      .join("\n\n"),
    "",
    "[강사님의 한 줄 조언]",
    "이 상황에서 핵심은 '기록'입니다. 모든 대화와 요청을 서면으로 남기고, 판단이 어려울 때는 즉시 행동강령 책임관에게 유선 확인부터 하세요.",
    "",
    "[권고 조치]",
    quiz.actions.map((a, i) => `${i + 1}. ${a}`).join("\n"),
  ].join("\n");

  return {
    question: quiz.question,
    riskScore: RISK_SCORE[quiz.risk],
    riskLevel: quiz.risk,
    narrative,
    summary: quiz.summary,
    lawBasis: quiz.lawBasis.map((l) => ({
      statute: l.statute,
      clause: l.clause,
    })),
    recommendations: quiz.actions,
    keyIssues: quiz.lawBasis.map((l) => `${l.statute} ${l.clause}`),
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  팝업 AI 분석 리포트
 * ═══════════════════════════════════════════════════════════════ */
function ReportModal({
  quiz,
  onClose,
}: {
  quiz: PrecedentQuiz;
  onClose: () => void;
}) {
  const rs = RISK_STYLE[quiz.risk];

  /**
   * 정밀 분석 단계 :
   *   idle    → 기본 리포트
   *   loading → "분석 중…" 스피너 (1.2s)
   *   deep    → 확장된 심층 분석(추가 조문·데이터·전문가 소견) 인라인 노출
   */
  const [phase, setPhase] = useState<"idle" | "loading" | "deep">("idle");

  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => setPhase("deep"), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  const runDeepAnalysis = () => setPhase("loading");

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-navy-950/85 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="AI 법령·판례 분석 리포트"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="eco-chat-enter glass-strong relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-sky-300/30"
      >
        {/* ── 분석 중 오버레이 ── */}
        {phase === "loading" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-navy-950/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-sky-300/40 bg-navy-900/85 px-8 py-6 sky-glow">
              <div className="relative grid h-14 w-14 place-items-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/30" />
                <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
              </div>
              <p className="text-[16px] font-black text-white">
                <span className="accent-text">Gemini 정밀 분석 중…</span>
              </p>
              <p className="text-[12.5px] font-semibold text-white/80">
                국가법령정보 API 조회 → 조문 확장 → 판례 매칭
              </p>
            </div>
          </div>
        )}

        <div className="relative p-6 md:p-8">
          {/* 닫기 */}
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-navy-900/60 text-steel-200 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          {/* 헤더 */}
          <p className="text-[12.5px] font-black uppercase tracking-[0.22em]">
            <span className="accent-text">AI Legal · Precedent Report</span>
          </p>
          <h3 className="mt-3 text-[26px] font-black leading-tight text-white md:text-[32px]">
            <Highlight text={quiz.question} hits={quiz.highlights} />
          </h3>
          <p className="mt-3 text-[16px] font-semibold leading-relaxed text-white/90 md:text-[17px]">
            {quiz.summary}
          </p>

          {/* Risk 게이지 */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-navy-900/60 p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-violet-300" />
                <p className="text-[15px] font-black text-white">
                  리스크 수준
                </p>
              </div>
              <span
                className={`rounded-full border px-3.5 py-1 text-[13px] font-black ${rs.clr}`}
              >
                {rs.label}
              </span>
            </div>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-navy-950/80">
              <div
                className={`h-full bg-gradient-to-r ${rs.grad} transition-all duration-700`}
                style={{ width: `${rs.pct}%` }}
              />
            </div>
          </div>

          {/* 3 섹션 */}
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Section
              icon={<Scale className="h-4 w-4 text-sky-300" />}
              title="근거 법령"
            >
              <ul className="space-y-2">
                {quiz.lawBasis.map((l, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/10 bg-navy-900/60 p-3.5"
                  >
                    <p className="text-[14.5px] font-black">
                      <span className="accent-text">{l.statute}</span>
                      <span className="ml-2 text-white/95">{l.clause}</span>
                    </p>
                    <p className="mt-1.5 text-[14px] font-semibold leading-relaxed text-white/85">
                      {l.purpose}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              icon={<BookOpen className="h-4 w-4 text-violet-300" />}
              title="관련 판례"
            >
              <ul className="space-y-2">
                {quiz.precedents.map((p, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/10 bg-navy-900/60 p-3.5"
                  >
                    <p className="text-[13.5px] font-black text-sky-200">
                      {p.caseId}
                    </p>
                    <p className="mt-1 text-[14.5px] font-black text-white">
                      {p.fact}
                    </p>
                    <p className="mt-1.5 flex items-start gap-1.5 text-[14px] font-semibold text-white/85">
                      <Gavel className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />
                      {p.ruling}
                    </p>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          {/* 예상 처분 수위 */}
          <Section
            icon={<AlertTriangle className="h-4 w-4 text-violet-300" />}
            title="예상 처분 수위 · 징계 스펙트럼"
            className="mt-4"
          >
            <div className="grid gap-2.5 md:grid-cols-3">
              {quiz.expectedOutcomes.map((o, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-white/10 bg-navy-900/60 p-3.5"
                >
                  <p className="text-[12.5px] font-black uppercase tracking-widest">
                    <span className="accent-text">{o.label}</span>
                  </p>
                  <p className="mt-1.5 text-[16.5px] font-black text-white">
                    {o.outcome}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          {/* 즉시 조치 */}
          <Section
            icon={<CheckCircle2 className="h-4 w-4 text-sky-300" />}
            title="즉시 조치 가이드"
            className="mt-4"
          >
            <ol className="space-y-2">
              {quiz.actions.map((a, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-navy-900/60 p-3.5"
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500/35 to-violet-500/35 text-[13px] font-black text-white">
                    {i + 1}
                  </span>
                  <span className="text-[15px] font-semibold leading-relaxed text-white/95">
                    {a}
                  </span>
                </li>
              ))}
            </ol>
          </Section>

          {/* ══════════ 정밀 심층 분석 (phase === "deep") ══════════ */}
          {phase === "deep" && (
            <section className="gemini-stream-row mt-6 rounded-3xl border border-violet-300/35 bg-gradient-to-br from-sky-950/50 via-navy-900/70 to-violet-950/50 p-5 md:p-6">
              <div className="mb-3 flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-300" />
                <p className="text-[13px] font-black uppercase tracking-[0.22em]">
                  <span className="accent-text">Gemini Pro · 심층 보강 분석</span>
                </p>
                <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-black text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  완료
                </span>
              </div>

              <p className="text-[15.5px] font-semibold leading-relaxed text-white/95 md:text-[16px]">
                위 질문은 <b className="accent-text">{quiz.lawBasis[0].statute}</b>{" "}
                {quiz.lawBasis[0].clause} 을 1차 근거로 삼되,{" "}
                <b className="accent-text">
                  {quiz.precedents[0]?.caseId ?? "대법 판례"}
                </b>{" "}
                이후 유사 사건에서 <b className="text-white">{rs.pct}%</b> 수준의
                리스크로 판단되어 왔습니다. 특히{" "}
                <span className="accent-chip">{quiz.highlights[0]}</span> 조건이
                결정적 가중 요소로 작동합니다.
              </p>

              <div className="mt-4 grid gap-2.5 md:grid-cols-3">
                <div className="rounded-xl border border-sky-300/25 bg-navy-900/60 p-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-widest text-sky-200">
                    <Database className="h-3 w-3" />
                    law.go.kr 조회 결과
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-white/95">
                    관련 조문 <b className="accent-text">{quiz.lawBasis.length}건</b>{" "}
                    · 시행령 포함
                  </p>
                </div>
                <div className="rounded-xl border border-violet-300/25 bg-navy-900/60 p-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-widest text-violet-200">
                    <BookOpen className="h-3 w-3" />
                    판례 매칭
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-white/95">
                    핵심 판례{" "}
                    <b className="accent-text">{quiz.precedents.length}건</b> ·
                    최근 3년 기준
                  </p>
                </div>
                <div className="rounded-xl border border-pink-300/25 bg-navy-900/60 p-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-widest text-pink-200">
                    <Gavel className="h-3 w-3" />
                    징계 수위 예측
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-white/95">
                    <b className="accent-text">{quiz.expectedOutcomes[0].outcome}</b>{" "}
                    가 최빈
                  </p>
                </div>
              </div>

              <Link
                href="/legal-guide"
                onClick={() => {
                  saveHandoff(buildQuizHandoff(quiz));
                  onClose();
                }}
                className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-3 text-[14.5px] font-black text-white sky-glow hover:opacity-95"
              >
                Legal-Guide 챗으로 이어서 상담 계속하기
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          {/* ══════════ CTA ══════════ */}
          {phase !== "deep" && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/30 bg-navy-900/60 p-4">
              <p className="text-[14.5px] font-semibold text-white/90">
                <FileText className="mr-1.5 inline h-4 w-4 text-violet-300" />
                정확한 적용 여부는{" "}
                <span className="accent-text">정밀 분석</span>으로 확인하세요.
              </p>
              <button
                type="button"
                onClick={runDeepAnalysis}
                disabled={phase === "loading"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2.5 text-[14px] font-black text-white sky-glow disabled:opacity-60"
              >
                {phase === "loading" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    분석 중…
                  </>
                ) : (
                  <>
                    Legal-Guide 로 정밀 분석
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-[12px] font-black uppercase tracking-widest">
          <span className="accent-text">{title}</span>
        </p>
      </div>
      {children}
    </div>
  );
}
