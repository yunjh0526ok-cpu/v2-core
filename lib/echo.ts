/**
 *  lib/echo.ts
 *  ─────────────────────────────────────────────────────────────────────
 *   "에코(Echo)" — 공직자의 든든한 AI 청렴 파트너 페르소나.
 *
 *   · 타겟: 공무원·공공기관 담당자 (강사 아님)
 *   · 호칭: 선생님 / 담당자님 / "반갑습니다!"  (금기: 강사님)
 *   · 핵심 키워드: 신뢰 · 공정 · 안심 · 파트너
 *   · 톤: 친절 + 전문 (가볍지 않게)
 *
 *   SSR-safe: 날짜 시드는 KST(UTC+9) 기준으로 안정화됨.
 */

export type EchoMood = "default" | "safe" | "risk" | "welcome";

export type EchoLine = {
  /** 화면 상단 말풍선 본문 (타이핑 애니용) */
  text: string;
  /** 상단 헤더에 달 수 있는 짧은 코멘트 */
  tagline: string;
  /** 현재 기분 / 애니메이션 상태 */
  mood: EchoMood;
  /** 아이콘 이모지 — 👍, 🔍, ✨, 🛡️ 중 하나 */
  icon: string;
};

/* ═══════════════════════════════════════════════════════════════════
 *  0. 시간대 판정 (KST 고정)
 * ═══════════════════════════════════════════════════════════════════ */

function nowKst(): Date {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utc + 9 * 60 * 60_000);
}

export type TimeBucket = "dawn" | "morning" | "afternoon" | "evening" | "night";

export function currentTimeBucket(d: Date = nowKst()): TimeBucket {
  const h = d.getHours();
  if (h < 5) return "night";
  if (h < 9) return "dawn";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

/* ═══════════════════════════════════════════════════════════════════
 *  1. 인사말 — 시간대별 * 호칭 별 조합
 *
 *     각 bucket 당 3~4개 후보를 두고 날짜-시드 무작위 선택.
 *     → 같은 날 여러 번 열어도 동일 (기분 흔들림 방지)
 *     → 매일 자정(KST)에 자동 회전
 * ═══════════════════════════════════════════════════════════════════ */

const GREETINGS: Record<TimeBucket, string[]> = {
  dawn: [
    "반갑습니다, 선생님. 이른 시간까지 공직을 지켜 주셔서 감사합니다. 오늘도 에코가 곁에서 함께합니다.",
    "새벽 근무 중이신가요? 담당자님의 한 걸음 한 걸음이 조직의 신뢰를 쌓습니다. 에코가 리스크를 미리 살피고 있어요.",
    "이른 아침부터 수고가 많으십니다. 오늘 결재·상담 전에 법령을 한번 같이 훑어볼까요?",
  ],
  morning: [
    "반갑습니다! 담당자님의 공정한 하루를 에코가 함께 엽니다. 상담이 필요하시면 언제든 말씀해 주세요.",
    "좋은 아침입니다, 선생님. 지금 가장 궁금한 규정부터 빠르게 짚어 드릴게요. 신뢰받는 하루 되세요.",
    "오전 업무 시작 전 10초, 에코의 체크리스트로 오늘의 리스크를 먼저 확인해 보시는 건 어떠세요?",
  ],
  afternoon: [
    "오후도 평안하시길 바랍니다. 담당자님이 안심하고 일하실 수 있도록 에코가 법령과 판례를 지키고 있어요.",
    "점심 잘 드셨나요? 오후는 민원이 많은 시간대입니다. 난감한 상황이 있으면 바로 상담 주세요.",
    "반갑습니다, 선생님. 조용한 오후에 최근 상담 추이를 살펴보는 것도 좋아요. Hub에서 바로 확인 가능합니다.",
  ],
  evening: [
    "하루 고생 많으셨습니다. 퇴근 전, 오늘 결재한 건 중 점검이 필요한 건이 있다면 에코에게 한 번 맡겨 주세요.",
    "저녁이 되었네요. 담당자님의 공정한 하루가 내일의 조직 신뢰로 이어집니다. 수고 많으셨어요.",
    "반갑습니다! 업무 마무리 시간에 에코가 체크리스트로 정리 도와드릴게요.",
  ],
  night: [
    "늦은 시간까지 수고 많으세요. 피곤할수록 판단이 흐려지기 쉬워요. 결재 전에 에코에게 한 번 문의해 주세요.",
    "야간 근무 중이신가요? 담당자님 옆에 에코가 조용히 자리를 지킵니다. 위험 감지 시 바로 알려드립니다.",
    "안심하고 쉬실 수 있도록, 에코는 24시간 법령과 판례를 돌아보고 있어요.",
  ],
};

const RISK_LINES = [
  "잠시만요, 리스크가 감지됐습니다. 에코가 돋보기를 들고 관련 조문을 확인하고 있어요.",
  "담당자님, 이 상황은 조심스러운 구간입니다. 함께 단계별로 점검해 볼까요?",
  "공정의 경계가 흐려질 수 있어요. 에코가 판례와 처분 사례를 바로 찾아 드릴게요.",
];

const SAFE_LINES = [
  "확인했습니다. 오늘 이 건은 안심하셔도 좋아요. 선생님의 판단이 정확합니다.",
  "좋은 선택이세요, 담당자님! 에코가 보기에도 문제 없습니다.",
  "이 상황은 신뢰 범위 안입니다. 에코가 엄지척!",
];

const WELCOME_TAGLINES = [
  "공정한 판단 곁에, 에코가 있습니다.",
  "신뢰는 문서보다 습관에서 쌓입니다.",
  "안심하고 결재하세요 — 에코가 함께 확인합니다.",
  "파트너로서 오늘도 리스크를 먼저 살펴 드릴게요.",
];

/* ═══════════════════════════════════════════════════════════════════
 *  2. 일일 청렴 명언
 *     — 날짜-시드(KST)로 하루에 한 문장만 노출되도록 고정
 * ═══════════════════════════════════════════════════════════════════ */

const QUOTES: Array<{ text: string; author?: string }> = [
  { text: "가장 큰 권위는 정직에서 나온다." },
  {
    text: "공직의 수입은 명예이지, 부(富)가 아니다.",
    author: "다산 정약용",
  },
  {
    text: "청렴은 목민관의 본무(本務)이며, 모든 선의 근원이다.",
    author: "목민심서",
  },
  { text: "작은 편의가 큰 재판이 되는 법이다." },
  { text: "공정한 절차는 결과보다 오래 기억된다." },
  {
    text: "한 번의 청탁은 열 번의 직무유기보다 조직을 먼저 무너뜨린다.",
  },
  { text: "신뢰는 쌓는 데 10년, 잃는 데 10초다." },
  { text: "규정을 읽는 습관이 가장 저렴한 보험이다." },
  { text: "공직자의 '안 됩니다'는 국민에 대한 최고의 예의다." },
  { text: "내가 당연하다고 여긴 관행이, 누군가에겐 부정이다." },
  { text: "오늘의 기록은 내일의 방패가 된다." },
  { text: "회피해야 할 자리에 앉지 않는 것이 가장 쉬운 준법이다." },
  { text: "선한 의도는 증거가 되지 않는다. 절차가 증거다." },
  { text: "감사받을 만큼 일하면, 감사받지 않는다." },
  {
    text: "이해관계는 고백해야 사라진다. 숨기는 순간 리스크가 된다.",
  },
];

export function dailyQuote(d: Date = nowKst()): { text: string; author?: string } {
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return QUOTES[seed % QUOTES.length];
}

/* ═══════════════════════════════════════════════════════════════════
 *  3. 에코 메시지 생성 (메인 진입 함수)
 * ═══════════════════════════════════════════════════════════════════ */

function seededPick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

export function getEchoLine(opts?: {
  /** 현재 화면이 감지한 리스크 레벨 */
  risk?: "safe" | "risk" | null;
  /** 특정 날짜로 시드 고정하고 싶을 때 (테스트용) */
  at?: Date;
}): EchoLine {
  const now = opts?.at ?? nowKst();
  const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  if (opts?.risk === "risk") {
    return {
      text: seededPick(RISK_LINES, seed + now.getHours()),
      tagline: "지금 바로 함께 점검해요.",
      mood: "risk",
      icon: "🔍",
    };
  }
  if (opts?.risk === "safe") {
    return {
      text: seededPick(SAFE_LINES, seed + now.getHours()),
      tagline: "오늘의 판단, 안심입니다.",
      mood: "safe",
      icon: "👍",
    };
  }

  const bucket = currentTimeBucket(now);
  const pool = GREETINGS[bucket];
  return {
    text: seededPick(pool, seed),
    tagline: seededPick(WELCOME_TAGLINES, seed),
    mood: "welcome",
    icon: bucket === "night" || bucket === "evening" ? "🛡️" : "✨",
  };
}
