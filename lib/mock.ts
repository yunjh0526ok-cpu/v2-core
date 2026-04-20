export type RiskTag = {
  id: string;
  label: string;
  category:
    | "갑질"
    | "청탁"
    | "이해충돌"
    | "예산·계약"
    | "인사·채용"
    | "정보보안"
    | "적극행정"
    | "규제개혁";
  weight: number;
};

export const RISK_TAGS: RiskTag[] = [
  { id: "harass", label: "직장 내 괴롭힘/갑질", category: "갑질", weight: 85 },
  { id: "power", label: "상급자 권한 남용", category: "갑질", weight: 78 },
  { id: "gift", label: "청탁금지법(3·5·10) 리스크", category: "청탁", weight: 88 },
  { id: "bid", label: "입찰·계약 공정성", category: "예산·계약", weight: 96 },
  { id: "conflict", label: "이해충돌 및 사적이해관계", category: "이해충돌", weight: 92 },
  { id: "hire", label: "채용·인사 공정성", category: "인사·채용", weight: 90 },
  { id: "budget", label: "예산 전용/유용 리스크", category: "예산·계약", weight: 84 },
  { id: "leak", label: "내부정보 유출 위험", category: "정보보안", weight: 80 },
  /* ── 적극행정 · 규제개혁 ── */
  { id: "passive-admin", label: "소극행정 징계 리스크", category: "적극행정", weight: 72 },
  { id: "active-immunity", label: "적극행정 면책 제도 활용", category: "적극행정", weight: 68 },
  { id: "sandbox", label: "규제 샌드박스·실증특례 활용", category: "규제개혁", weight: 65 },
  { id: "reform-barrier", label: "숨은 규제·불합리 규정 발굴", category: "규제개혁", weight: 60 },
];

export type IntegrityDept = {
  name: string;
  risk: number;
  trend: number;
  openCases: number;
};

export const DEPT_DATA: IntegrityDept[] = [
  { name: "기획조정실", risk: 34, trend: -6, openCases: 2 },
  { name: "감사담당관", risk: 18, trend: -3, openCases: 1 },
  { name: "계약·조달팀", risk: 72, trend: +4, openCases: 5 },
  { name: "인사혁신과", risk: 46, trend: -2, openCases: 3 },
  { name: "예산재정과", risk: 58, trend: +2, openCases: 4 },
  { name: "민원소통실", risk: 28, trend: -5, openCases: 1 },
];

export const TREND_SERIES = [
  { month: "2025-11", score: 72 },
  { month: "2025-12", score: 74 },
  { month: "2026-01", score: 71 },
  { month: "2026-02", score: 76 },
  { month: "2026-03", score: 79 },
  { month: "2026-04", score: 83 },
];

export type ActivityItem = {
  id: string;
  type: "legal" | "dialogue" | "hub" | "apply";
  title: string;
  time: string;
  detail: string;
};

export const ACTIVITY_FEED: ActivityItem[] = [
  {
    id: "a1",
    type: "legal",
    title: "법령 상담: 청탁금지법 5만원 기준",
    time: "방금",
    detail: "리스크 42% → 경고 2건 인용",
  },
  {
    id: "a2",
    type: "dialogue",
    title: "라이브 세션: 이해충돌 사례 토론",
    time: "3분 전",
    detail: "참여자 64명 · 긍정 71%",
  },
  {
    id: "a3",
    type: "hub",
    title: "청렴 진단 보고서 생성 완료",
    time: "18분 전",
    detail: "계약·조달팀 리스크 72%",
  },
  {
    id: "a4",
    type: "apply",
    title: "신청: OO시청 / 강의 의뢰",
    time: "1시간 전",
    detail: "AI 커리큘럼 초안 발송",
  },
];
