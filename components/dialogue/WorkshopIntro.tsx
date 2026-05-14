"use client";

/**
 *  components/dialogue/WorkshopIntro.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   2026년 Ethics-Core AI 워크숍 소개 패널.
 *
 *   [2시간 / 3시간 / 4시간] 드롭다운을 선택하면
 *   Lecture → AI 실시간 분석 → 사례 투표 → 종합 피드백 동선이
 *   시간에 맞게 자동 배분되어 카드 그리드로 렌더링됩니다.
 *
 *   컬러 톤: 스카이 ↔ 바이올렛 그라데이션
 */

import { useEffect, useMemo, useState } from "react";
import {
  QrCode,
  Smartphone,
  Users,
  Sparkles,
  Activity,
  MessageSquare,
  CheckCircle2,
  Timer,
  ChevronDown,
  GraduationCap,
  BarChart3,
  Vote,
  ClipboardCheck,
} from "lucide-react";

type DurationMin = 120 | 180 | 240;

type StageKind = "lecture" | "analysis" | "vote" | "feedback";

type Stage = {
  kind: StageKind;
  title: string;
  detail: string;
  /** 전체 세션에서 차지하는 비율 (합이 1) */
  weight: number;
};

const STAGE_TEMPLATE: Stage[] = [
  {
    kind: "lecture",
    title: "① 강사 강연 · 개념 · 최신 판례",
    detail:
      "기관 최근 리스크 데이터 + 국가법령 API 기반 핵심 판례 10건 강의. 주제별 법령 프레임워크 정립.",
    weight: 0.28,
  },
  {
    kind: "analysis",
    title: "② Gemini 실시간 분석",
    detail:
      "강의 중 실시간 키워드 ↔ Gemini 가 근거 조문·예상 처분 수위·관련 판례를 팝업으로 옆 화면에 스트리밍.",
    weight: 0.22,
  },
  {
    kind: "vote",
    title: "③ 사례 투표 · 딜레마 퀴즈",
    detail:
      "Q1~Q4 4대 카테고리별 실제 사례 투표. 스마트폰 QR 접속 → 감정 타임라인 + 찬반 그래프 실시간 시각화.",
    weight: 0.32,
  },
  {
    kind: "feedback",
    title: "④ 종합 피드백 · 액션 플랜",
    detail:
      "AI 가 투표·발화 데이터를 자동 요약 → 강사 코멘트 + 1주일 리마인드 발송. 조직 리스크 히트맵 도출.",
    weight: 0.18,
  },
];

const DURATION_OPTIONS: { value: DurationMin; label: string; tag: string }[] = [
  { value: 120, label: "2시간 (집중형 미니 워크숍)", tag: "120분" },
  { value: 180, label: "3시간 (표준 워크숍)", tag: "180분" },
  { value: 240, label: "4시간 (심화·Deep Dive)", tag: "240분" },
];

const FEATURES = [
  {
    icon: QrCode,
    title: "QR 1초 접속",
    desc: "설치·회원가입 없음. 스마트폰에서 바로 참여",
  },
  {
    icon: Activity,
    title: "실시간 감정 타임라인",
    desc: "발화·투표의 정서 흐름을 시간축에서 가시화",
  },
  {
    icon: MessageSquare,
    title: "익명 패들렛 벽",
    desc: "하고 싶은 말이 있지만 손들지 못한 참여자도 안전",
  },
  {
    icon: Sparkles,
    title: "AI 실시간 분류",
    desc: "Gemini 가 질문·의견을 주제별로 자동 클러스터링",
  },
];

const KIND_META: Record<
  StageKind,
  { Icon: typeof GraduationCap; grad: string; chip: string; label: string }
> = {
  lecture: {
    Icon: GraduationCap,
    grad: "from-sky-400 to-indigo-500",
    chip: "border-sky-300/40 bg-sky-500/15 text-sky-200",
    label: "Lecture",
  },
  analysis: {
    Icon: BarChart3,
    grad: "from-indigo-400 to-violet-500",
    chip: "border-indigo-300/40 bg-indigo-500/15 text-indigo-200",
    label: "AI Analysis",
  },
  vote: {
    Icon: Vote,
    grad: "from-violet-500 to-fuchsia-500",
    chip: "border-violet-300/40 bg-violet-500/15 text-violet-200",
    label: "Voting",
  },
  feedback: {
    Icon: ClipboardCheck,
    grad: "from-fuchsia-500 to-pink-500",
    chip: "border-fuchsia-300/40 bg-fuchsia-500/15 text-fuchsia-200",
    label: "Feedback",
  },
};

/** n 분을 "HH:MM" 타임라인 스탬프로 환산 */
function fmtRange(startMin: number, lenMin: number) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const s = startMin;
  const e = startMin + lenMin;
  const h = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  return `${h(s)} – ${h(e)} · ${lenMin}분`;
}

export default function WorkshopIntro() {
  const [copied, setCopied] = useState(false);
  const [duration, setDuration] = useState<DurationMin>(180);
  const [sampleUrl, setSampleUrl] = useState("/dialogue#live");

  useEffect(() => {
    setSampleUrl(`${window.location.origin}/dialogue#live`);
  }, []);

  const stages = useMemo(() => {
    // 5분 단위로 반올림된 소요시간
    const lens = STAGE_TEMPLATE.map((s) =>
      Math.max(10, Math.round((duration * s.weight) / 5) * 5)
    );
    // 누적합으로 start 계산
    const starts = lens.reduce<number[]>((acc, cur, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + lens[i - 1]);
      return acc;
    }, []);
    return STAGE_TEMPLATE.map((s, i) => ({
      ...s,
      start: starts[i],
      len: lens[i],
    }));
  }, [duration]);

  const totalAssigned = stages.reduce((a, b) => a + b.len, 0);

  return (
    <section className="space-y-5">
      {/* HERO */}
      <div className="glass-strong gradient-border relative overflow-hidden rounded-3xl p-5 md:p-7">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="text-[11.5px] font-black uppercase tracking-[0.22em]">
              <span className="accent-text">
                Dialogue Workshop · 실시간 참여형 세션
              </span>
            </p>
            <h1 className="mt-2 text-3xl font-black leading-tight text-white md:text-[36px]">
              2026년 <span className="gradient-text">Ethics-Core AI</span>{" "}
              워크숍
            </h1>
            <p className="mt-3 max-w-2xl text-[14.5px] font-semibold leading-relaxed text-white/85 md:text-[15.5px]">
              멘티미터·패들렛의{" "}
              <span className="accent-chip">참여 감성</span>과 Ethics-Core AI 의{" "}
              <span className="accent-chip">데이터 기반 시나리오 설계</span>를
              결합한 실시간 워크숍. 수강생의 스마트폰이 곧 발언대가 되고, 모든
              반응은 감정 타임라인과 워드클라우드로 시각화됩니다.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2 md:grid-cols-4">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl border border-sky-300/15 bg-navy-900/50 p-3"
                  >
                    <Icon className="h-4 w-4 text-sky-300" />
                    <p className="mt-1.5 text-[12.5px] font-black text-white">
                      {f.title}
                    </p>
                    <p className="text-[11px] leading-snug text-steel-300">
                      {f.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* QR card */}
          <div className="gradient-border rounded-2xl bg-gradient-to-br from-violet-950/35 via-navy-900/80 to-sky-950/35 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-sky-300" />
              <p className="text-[11px] font-black uppercase tracking-widest">
                <span className="accent-text">수강생 접속 안내</span>
              </p>
            </div>
            <div className="rounded-xl border border-sky-300/20 bg-navy-900/70 p-4">
              <div className="flex items-center gap-3">
                <div className="grid h-20 w-20 place-items-center rounded-xl border border-sky-300/40 bg-white p-1.5">
                  <QrSkeleton />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-steel-300">
                    워크숍 코드
                  </p>
                  <p className="mt-0.5 text-2xl font-black tracking-widest">
                    <span className="accent-text">ETC-2026</span>
                  </p>
                  <p className="mt-1.5 truncate text-[11px] text-steel-300">
                    {sampleUrl}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(sampleUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] py-2 text-[12px] font-black text-white/90 hover:bg-white/10"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                    링크 복사됨
                  </>
                ) : (
                  "워크숍 링크 복사"
                )}
              </button>
            </div>
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] font-semibold text-white/80">
              <Users className="h-3 w-3 text-sky-300" />
              QR 스캔 → 별도 설치 없이 즉시 참여
            </p>
          </div>
        </div>
      </div>

      {/* ═══════════ 시간 선택 + 자동 생성 커리큘럼 ═══════════ */}
      <div className="gradient-border glass rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Timer className="h-5 w-5 text-sky-300" />
          <h2 className="text-[18px] font-black text-white md:text-xl">
            <span className="accent-text">워크숍 커리큘럼</span>
            <span className="ml-2 text-white">· 시간대별 자동 배분</span>
          </h2>

          <div className="relative ml-auto">
            <select
              aria-label="워크숍 시간 선택"
              value={duration}
              onChange={(e) =>
                setDuration(Number(e.target.value) as DurationMin)
              }
              className="appearance-none rounded-xl border border-sky-300/40 bg-navy-900/80 px-4 py-2.5 pr-10 text-[14px] font-black text-white outline-none focus:border-sky-300/80"
            >
              {DURATION_OPTIONS.map((o) => (
                <option
                  key={o.value}
                  value={o.value}
                  className="bg-navy-900 text-white"
                >
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-300"
            />
          </div>
        </div>

        <p className="mt-2 text-[13.5px] font-semibold text-white/80">
          선택한 시간({totalAssigned}분)에 맞춰{" "}
          <span className="accent-chip">강사 강연</span> →{" "}
          <span className="accent-chip">AI 실시간 분석</span> →{" "}
          <span className="accent-chip">사례 투표</span> →{" "}
          <span className="accent-chip">종합 피드백</span> 동선이 자동 배분됩니다.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {stages.map((s, i) => {
            const M = KIND_META[s.kind];
            const Icon = M.Icon;
            return (
              <div
                key={i}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-navy-900/55 p-4"
              >
                <span
                  className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${M.grad}`}
                />
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-black uppercase tracking-widest ${M.chip}`}
                  >
                    <Icon className="h-3 w-3" />
                    {M.label}
                  </span>
                  <span className="ml-auto text-[11.5px] font-black text-white/85">
                    {fmtRange(s.start, s.len)}
                  </span>
                </div>
                <p className="mt-2 text-[15px] font-black leading-snug text-white">
                  {s.title}
                </p>
                <p className="mt-1.5 text-[13px] font-semibold leading-relaxed text-white/80">
                  {s.detail}
                </p>
              </div>
            );
          })}
        </div>

        {/* 타임라인 바 */}
        <div className="mt-5 overflow-hidden rounded-full border border-white/10">
          <div className="flex h-3 w-full">
            {stages.map((s, i) => {
              const M = KIND_META[s.kind];
              const pct = (s.len / totalAssigned) * 100;
              return (
                <div
                  key={i}
                  className={`bg-gradient-to-r ${M.grad}`}
                  style={{ width: `${pct}%` }}
                  title={`${KIND_META[s.kind].label} · ${s.len}분`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* 전환 스크롤 유도 */}
      <div className="gradient-border flex items-center justify-between rounded-2xl bg-gradient-to-r from-navy-900/90 via-navy-800/90 to-navy-900/90 px-5 py-3">
        <p className="text-[13px] font-bold text-white/90">
          아래에서 실제 라이브 세션 화면을 체험해 보세요. 투표·감정
          타임라인·패들렛이 시뮬레이션 됩니다.
        </p>
        <a
          href="#live"
          className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2 text-[12.5px] font-black text-white sky-glow"
        >
          라이브 데모 ↓
        </a>
      </div>
    </section>
  );
}

function QrSkeleton() {
  return <QrCode className="h-full w-full text-navy-900" />;
}
