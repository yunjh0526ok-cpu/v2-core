"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Building2,
  Users,
  ShieldAlert,
  CalendarCheck,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Send,
  Target,
  TrendingUp,
  Printer,
  ShieldCheck,
  BookOpen,
  Clock,
} from "lucide-react";
import { RISK_TAGS, RiskTag } from "@/lib/mock";

type ApplyMode = "lecture" | "partnership";
type Step = 0 | 1 | 2 | 3;

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "ok"; id: string }
  | { kind: "error"; message: string };

type AiParticipation = "ai-interactive" | "lecture-focused" | "";

type FormState = {
  mode: ApplyMode;
  institutionName: string;
  contactName: string;
  contactEmail: string;
  orgScale: string;
  participants: string;
  preferredDate: string;
  preferredTimeStart: string;
  preferredTimeEnd: string;
  location: string;
  selectedRisks: string[];
  aiParticipation: AiParticipation;
  goal: string;
  partnershipPurposes: string[];
  timeline: string;
};

/** 제안서 하단 고정 담당자 정보 — 실제 이메일로 교체하세요 */
const CONTACT = {
  name: "주양순",
  phone: "010-6667-1467",
  email: "yszoo1467@naver.com",
} as const;

const ORG_SCALES = [
  "1~10명",
  "11~50명",
  "51~200명",
  "201~1,000명",
  "1,000명 이상",
  "공공기관/지자체",
];

const PARTNERSHIP_PURPOSES = [
  "예비창업패키지 실증(PoC)",
  "공공기관 윤리 AI 협업",
  "기관 맞춤형 교육 플랫폼 구축",
  "SaaS 도입 및 정기 구독",
  "공동 연구 및 성과 확산",
];

const STEPS: { label: string; desc: string }[] = [
  { label: "기관 정보", desc: "누가 신청하나요?" },
  { label: "고민 분석", desc: "어떤 리스크가 있나요?" },
  { label: "실행 조건", desc: "언제·어떻게 진행하나요?" },
  { label: "AI 제안서 미리보기", desc: "맞춤 커리큘럼을 확인하세요" },
];

/** 상담 이슈 → RISK_TAGS ID 매핑 */
const ISSUE_TO_RISK_IDS: Record<string, string[]> = {
  "이해충돌": ["conflict"],
  "청탁금지": ["gift"],
  "갑질":    ["harass"],
  "부당지시": ["power"],
  "공익신고": ["harass"], // 가장 유사한 태그
};

/** ContextBar orgType → ApplyWizard orgScale 매핑 */
const ORGTYPE_TO_SCALE: Record<string, string> = {
  "중앙부처·청":    "공공기관/지자체",
  "광역시도·지자체": "공공기관/지자체",
  "공기업·공공기관": "공공기관/지자체",
  "교육기관·교육청": "공공기관/지자체",
  "군·경찰·소방":   "공공기관/지자체",
};

export default function ApplyWizard() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState<FormState>({
    mode: "lecture",
    institutionName: "",
    contactName: "",
    contactEmail: "",
    orgScale: "",
    participants: "",
    preferredDate: "",
    preferredTimeStart: "",
    preferredTimeEnd: "",
    location: "",
    selectedRisks: [],
    aiParticipation: "",
    goal: "",
    partnershipPurposes: [],
    timeline: "",
  });
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });
  const [autoFilled, setAutoFilled] = useState(false);

  /** URL 파라미터에서 상담 맥락 자동 주입 */
  useEffect(() => {
    if (!searchParams) return;
    const issue   = searchParams.get("issue") ?? "";
    const orgType = searchParams.get("orgType") ?? "";

    const riskIds  = ISSUE_TO_RISK_IDS[issue] ?? [];
    const orgScale = ORGTYPE_TO_SCALE[orgType] ?? "";

    if (riskIds.length > 0 || orgScale) {
      setForm((prev) => ({
        ...prev,
        selectedRisks: riskIds.length > 0 ? riskIds : prev.selectedRisks,
        orgScale:       orgScale            || prev.orgScale,
      }));
      setAutoFilled(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTags = useMemo(
    () => RISK_TAGS.filter((r) => form.selectedRisks.includes(r.id)),
    [form.selectedRisks]
  );

  const priorityRisk = useMemo(
    () =>
      [...selectedTags].sort((a, b) => b.weight - a.weight)[0] ?? null,
    [selectedTags]
  );

  const riskScore = useMemo(() => {
    if (selectedTags.length === 0) return 0;
    const avg =
      selectedTags.reduce((a, r) => a + r.weight, 0) / selectedTags.length;
    return Math.round(avg);
  }, [selectedTags]);

  const curriculum = useMemo(
    () => buildCurriculum(form, selectedTags, priorityRisk),
    [form, selectedTags, priorityRisk]
  );

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleRisk = (id: string) =>
    setForm((prev) => ({
      ...prev,
      selectedRisks: prev.selectedRisks.includes(id)
        ? prev.selectedRisks.filter((r) => r !== id)
        : [...prev.selectedRisks, id],
    }));

  const togglePurpose = (label: string) =>
    setForm((prev) => ({
      ...prev,
      partnershipPurposes: prev.partnershipPurposes.includes(label)
        ? prev.partnershipPurposes.filter((p) => p !== label)
        : [...prev.partnershipPurposes, label],
    }));

  const submit = async () => {
    setStatus({ kind: "saving" });
    const payload = {
      ...form,
      riskScore,
      priorityRiskId: priorityRisk?.id ?? null,
    };
    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        const msg =
          json?.details?.[0]?.message ??
          json?.error ??
          `저장 실패 (HTTP ${res.status})`;
        setStatus({ kind: "error", message: String(msg) });
        return;
      }
      setStatus({ kind: "ok", id: json.data.id });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "네트워크 오류. 잠시 후 다시 시도해주세요.",
      });
    }
  };

  const canNext = () => {
    if (step === 0)
      return !!form.institutionName && !!form.contactName && !!form.contactEmail;
    if (step === 1) return form.selectedRisks.length > 0 && !!form.aiParticipation;
    if (step === 2) {
      if (form.mode === "lecture")
        return !!form.participants && !!form.preferredDate;
      return !!form.orgScale && form.partnershipPurposes.length > 0;
    }
    return true;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      {/* LEFT: WIZARD */}
      <section className="gradient-border glass rounded-3xl p-6 md:p-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-black uppercase tracking-[0.22em] text-orange-300">
              Smart Application · v2-core
            </p>
            <h2 className="mt-1 text-2xl font-black text-white md:text-[28px]">
              <span className="text-orange-300">AI 기반</span> 지능형 신청 위저드
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-white/80 md:text-[15px]">
              기관 <span className="text-orange-300 font-black">고민</span> 입력 →{" "}
              <span className="text-orange-300 font-black">맞춤 커리큘럼</span>이
              실시간으로 생성됩니다.
            </p>
          </div>
          <ModeToggle
            value={form.mode}
            onChange={(m) => update("mode", m)}
          />
        </div>

        <Stepper step={step} />

        {/* ── AI 상담 맥락 자동 입력 안내 ── */}
        {autoFilled && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/[0.08] px-4 py-2.5">
            <span className="text-base">✅</span>
            <div>
              <p className="text-[12.5px] font-black text-white">
                AI 상담 내용 기반 자동 입력
              </p>
              <p className="text-[11px] font-semibold text-white/60">
                Legal-Guide 상담에서 감지된 리스크가 2단계에 미리 선택됐습니다. 확인 후 진행하세요.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6">
          {step === 0 && (
            <StepInstitution form={form} update={update} />
          )}
          {step === 1 && (
            <StepRisks
              selected={form.selectedRisks}
              toggle={toggleRisk}
              riskScore={riskScore}
              aiParticipation={form.aiParticipation}
              setAiParticipation={(v) => update("aiParticipation", v)}
              goal={form.goal}
              setGoal={(v) => update("goal", v)}
            />
          )}
          {step === 2 && (
            <StepExecution
              form={form}
              update={update}
              togglePurpose={togglePurpose}
            />
          )}
          {step === 3 && (
            <>
              <StepReview
                form={form}
                selectedTags={selectedTags}
                riskScore={riskScore}
                priorityRisk={priorityRisk}
              />
              <CurriculumReport
                form={form}
                curriculum={curriculum}
                selectedTags={selectedTags}
                priorityRisk={priorityRisk}
                riskScore={riskScore}
              />
            </>
          )}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => (Math.max(s - 1, 0) as Step))}
            disabled={step === 0}
            className="flex items-center gap-1 rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-steel-300 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            이전
          </button>

          {step < 3 ? (
            <button
              type="button"
              disabled={!canNext()}
              onClick={() => setStep((s) => (Math.min(s + 1, 3) as Step))}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-6 py-3 text-[14px] font-black text-white orange-glow disabled:opacity-50"
            >
              다음 단계
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={status.kind === "saving" || status.kind === "ok"}
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-navy-700 to-orange-550 px-6 py-3 text-[14px] font-black text-white orange-glow disabled:opacity-50"
            >
              {status.kind === "ok" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  접수 완료
                </>
              ) : status.kind === "saving" ? (
                <>
                  <Send className="h-3.5 w-3.5 animate-pulse" />
                  저장 중...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  제출 및 AI 제안서 확정
                </>
              )}
            </button>
          )}
        </div>

        {status.kind === "ok" && (
          <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-xs text-emerald-100">
            신청이 데이터베이스에 저장되었습니다 (id: {status.id}). 우측 AI
            맞춤 커리큘럼이 담당자에게 자동 전송되었으며, 24시간 내 확정안을
            회신드립니다.
          </div>
        )}
        {status.kind === "error" && (
          <div className="mt-5 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-xs text-rose-100">
            저장 실패: {status.message}
          </div>
        )}
      </section>

      {/* RIGHT: LIVE AI PREVIEW */}
      <section className="glass-strong sticky top-28 h-fit rounded-3xl p-6">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-orange-400" />
          <p className="text-sm font-black text-white">
            AI 맞춤 커리큘럼 제안서 · Live Preview
          </p>
        </div>
        <p className="text-[11px] text-steel-300">
          폼을 채울수록 제안서가 실시간으로 정교해집니다.
        </p>

        <div className="mt-4 space-y-4 text-sm text-steel-100">
          <PreviewRow label="신청 유형" value={form.mode === "lecture" ? "강의/컨설팅" : "사업 협력/파트너십"} />
          <PreviewRow label="기관" value={form.institutionName || "(입력 대기)"} />
          {form.aiParticipation && (
            <PreviewRow
              label="AI 참여형 여부"
              value={form.aiParticipation === "ai-interactive" ? "✅ AI 참여형 (Dialogue QR)" : "📖 강의 중심형"}
            />
          )}
          {form.preferredDate && (
            <PreviewRow label="희망 일자" value={form.preferredDate} />
          )}
          {form.preferredTimeStart && form.preferredTimeEnd && (
            <PreviewRow
              label="희망 시간"
              value={`${form.preferredTimeStart} ~ ${form.preferredTimeEnd}  (${calcDuration(form.preferredTimeStart, form.preferredTimeEnd) || "-"})`}
            />
          )}
          {selectedTags.length > 0 && (
            <div>
              <p className="text-[11px] font-bold text-orange-300">
                선택된 리스크 ({selectedTags.length})
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {selectedTags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold text-orange-200"
                  >
                    {t.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-4">
            <p className="text-[11px] font-bold text-orange-300">
              AI 종합 리스크 평가
            </p>
            <div className="mt-2 flex items-end gap-3">
              <p className="text-4xl font-black text-white">
                {riskScore}
                <span className="text-base text-steel-300">%</span>
              </p>
              <p className="pb-1 text-[11px] text-steel-300">
                {priorityRisk
                  ? `최우선: ${priorityRisk.label}`
                  : "리스크 미선택"}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 flex items-center gap-1 text-[11px] font-bold text-orange-300">
              <FileText className="h-3 w-3" />
              추천 커리큘럼 초안
            </p>
            <ol className="space-y-2">
              {curriculum.map((c, i) => (
                <li
                  key={i}
                  className="rounded-xl border border-white/10 bg-navy-900/60 p-3"
                >
                  <p className="text-[11px] font-bold text-orange-300">
                    Module {i + 1} · {c.duration}
                  </p>
                  <p className="mt-1 text-sm font-bold text-white">
                    {c.title}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-steel-300">
                    {c.summary}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ---------- Sub components ---------- */

function ModeToggle({
  value,
  onChange,
}: {
  value: ApplyMode;
  onChange: (m: ApplyMode) => void;
}) {
  return (
    <div className="flex rounded-xl border border-white/10 bg-navy-900/60 p-1 text-[11px] font-bold">
      {(
        [
          ["lecture", "강의/컨설팅"],
          ["partnership", "사업 협력"],
        ] as [ApplyMode, string][]
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`rounded-lg px-3 py-1.5 ${
            value === k
              ? "bg-gradient-to-r from-navy-700 to-orange-550 text-white"
              : "text-steel-300 hover:text-white"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <ol className="grid grid-cols-4 gap-3">
      {STEPS.map((s, i) => {
        const state = i < step ? "done" : i === step ? "active" : "todo";
        return (
          <li key={s.label} className="relative">
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                state === "active"
                  ? "border-orange-400/60 bg-orange-500/10"
                  : state === "done"
                    ? "border-emerald-400/30 bg-emerald-500/5"
                    : "border-white/10 bg-navy-900/60"
              }`}
            >
              <span
                className={`grid h-6 w-6 place-items-center rounded-lg text-[11px] font-black ${
                  state === "active"
                    ? "bg-gradient-to-br from-navy-700 to-orange-550 text-white"
                    : state === "done"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/5 text-steel-400"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <div>
                <p className="text-[11px] font-black text-white">
                  {s.label}
                </p>
                <p className="text-[10px] text-steel-400">{s.desc}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StepInstitution({
  form,
  update,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field
        icon={Building2}
        label="기관명"
        value={form.institutionName}
        onChange={(v) => update("institutionName", v)}
        placeholder="예: 국민권익위원회 / OO시청"
      />
      <Field
        icon={Users}
        label="담당자 이름"
        value={form.contactName}
        onChange={(v) => update("contactName", v)}
        placeholder="예: 홍길동 주무관"
      />
      <Field
        label="담당자 이메일"
        type="email"
        value={form.contactEmail}
        onChange={(v) => update("contactEmail", v)}
        placeholder="name@institution.go.kr"
      />
      <Field
        label="기관 규모"
        select
        options={ORG_SCALES}
        value={form.orgScale}
        onChange={(v) => update("orgScale", v)}
      />
    </div>
  );
}

// 4개 통합 그룹 (여러 category를 하나로 묶음)
const RISK_GROUPS: {
  keys: RiskTag["category"][];
  label: string;
  color: string;
  activeBg: string;
}[] = [
  {
    keys: ["갑질"],
    label: "갑질·조직문화",
    color: "text-rose-200",
    activeBg: "border-rose-400/60 bg-rose-500/15",
  },
  {
    keys: ["청탁", "이해충돌"],
    label: "청탁·이해충돌",
    color: "text-amber-200",
    activeBg: "border-amber-400/60 bg-amber-500/15",
  },
  {
    keys: ["예산·계약", "인사·채용", "정보보안"],
    label: "예산·계약",
    color: "text-sky-200",
    activeBg: "border-sky-400/60 bg-sky-500/15",
  },
  {
    keys: ["적극행정", "규제개혁"],
    label: "적극행정·규제개혁",
    color: "text-emerald-200",
    activeBg: "border-emerald-400/60 bg-emerald-500/15",
  },
];

const AI_PARTICIPATION_OPTIONS: { value: "ai-interactive" | "lecture-focused"; label: string; desc: string }[] = [
  {
    value: "ai-interactive",
    label: "AI 참여형",
    desc: "Dialogue QR 실시간 투표 · AI 감정 분석 · 즉석 딜레마 투표",
  },
  {
    value: "lecture-focused",
    label: "강의 중심형",
    desc: "전통 강의 + Legal-Guide AI 시연 · 사례 분석 중심",
  },
];

function StepRisks({
  selected,
  toggle,
  riskScore,
  aiParticipation,
  setAiParticipation,
  goal,
  setGoal,
}: {
  selected: string[];
  toggle: (id: string) => void;
  riskScore: number;
  aiParticipation: "ai-interactive" | "lecture-focused" | "";
  setAiParticipation: (v: "ai-interactive" | "lecture-focused") => void;
  goal: string;
  setGoal: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* 리스크 헤더 */}
      <div className="flex items-center justify-between rounded-2xl border border-sky-300/30 bg-navy-900/60 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-sky-300" />
          <p className="text-[16px] font-black text-white md:text-[17px]">
            기관의 <span className="accent-text">리스크 유형</span> 선택
          </p>
        </div>
        <span className="text-[12px] font-bold text-steel-200">
          복수 선택 · AI 가중치 분석
        </span>
      </div>

      {/* 4개 통합 그룹 렌더링 */}
      {RISK_GROUPS.map(({ keys, label, color, activeBg }) => {
        const tags = RISK_TAGS.filter((t) => keys.includes(t.category));
        return (
          <div key={label}>
            <p className={`mb-2 flex items-center gap-1.5 text-[12px] font-black uppercase tracking-widest ${color}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${color.replace("text-", "bg-")}`} />
              {label}
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {tags.map((t) => {
                const active = selected.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggle(t.id)}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-all ${
                      active
                        ? `${activeBg} text-white`
                        : "border-white/10 bg-navy-900/60 text-steel-100 hover:border-white/25"
                    }`}
                  >
                    <div>
                      <p className="text-[14px] font-black">{t.label}</p>
                      <p className="mt-0.5 text-[11.5px] text-steel-300">
                        {t.category} · 영향도 {t.weight}
                      </p>
                    </div>
                    {active && <CheckCircle2 className="h-5 w-5 shrink-0 text-sky-300" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* AI 참여형 여부 */}
      <div>
        <p className="mb-2 text-[13px] font-black text-white">
          <span className="accent-text">AI 참여형 여부</span>{" "}
          <span className="text-[11px] font-semibold text-steel-300">(필수)</span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {AI_PARTICIPATION_OPTIONS.map((opt) => {
            const active = aiParticipation === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAiParticipation(opt.value)}
                className={`flex flex-col gap-1 rounded-2xl border px-4 py-3.5 text-left transition-all ${
                  active
                    ? "border-sky-300/70 bg-gradient-to-br from-sky-500/15 to-violet-500/15 text-white sky-glow"
                    : "border-white/10 bg-navy-900/60 text-steel-100 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[14px] font-black">{opt.label}</p>
                  {active && <CheckCircle2 className="h-5 w-5 text-sky-300" />}
                </div>
                <p className="text-[12px] leading-snug text-steel-300">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 추가 목표 메모 */}
      <div>
        <p className="mb-1.5 text-[13px] font-black text-white">
          추가 요청 사항 <span className="text-[11px] font-semibold text-steel-300">(선택)</span>
        </p>
        <textarea
          rows={3}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="예: 팀장급 40명 대상 이해충돌 실전 사례 워크숍, 외부 강사 1인 포함 희망"
          className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3.5 py-3 text-[15px] font-semibold text-white placeholder:text-steel-500 outline-none focus:border-sky-300/60"
        />
      </div>

      <div className="rounded-2xl border border-sky-300/30 bg-sky-500/10 px-4 py-3.5 text-[14px] font-bold text-sky-100">
        현재 선택된 리스크 평균 가중치 ·{" "}
        <span className="text-[18px] font-black accent-text">{riskScore}%</span>
      </div>
    </div>
  );
}

function StepExecution({
  form,
  update,
  togglePurpose,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  togglePurpose: (label: string) => void;
}) {
  if (form.mode === "lecture") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          icon={Users}
          label="참여 인원"
          type="number"
          value={form.participants}
          onChange={(v) => update("participants", v)}
          placeholder="예: 120"
        />
        <Field
          icon={CalendarCheck}
          label="희망 일자"
          type="date"
          value={form.preferredDate}
          onChange={(v) => update("preferredDate", v)}
        />
        {/* 희망 시간 범위 선택 (col-span-2) */}
        <div className="md:col-span-2">
          <TimeRangePicker
            start={form.preferredTimeStart}
            end={form.preferredTimeEnd}
            onStartChange={(v) => update("preferredTimeStart", v)}
            onEndChange={(v) => update("preferredTimeEnd", v)}
          />
        </div>
        <Field
          label="장소"
          value={form.location}
          onChange={(v) => update("location", v)}
          placeholder="예: 본관 대강당 / 온라인(ZOOM)"
        />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Field
        label="추진 희망 시점"
        value={form.timeline}
        onChange={(v) => update("timeline", v)}
        placeholder="예: 2026년 3분기 내 PoC 시작"
      />
      <div>
        <p className="mb-2 text-[11px] font-bold text-steel-300">
          협업 목적 (복수 선택)
        </p>
        <div className="grid gap-2 md:grid-cols-2">
          {PARTNERSHIP_PURPOSES.map((p) => {
            const active = form.partnershipPurposes.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePurpose(p)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm ${
                  active
                    ? "border-orange-400/60 bg-orange-500/10 text-white"
                    : "border-white/10 bg-navy-900/60 text-steel-200 hover:border-white/20"
                }`}
              >
                <span className="text-sm">{p}</span>
                {active && <CheckCircle2 className="h-4 w-4 text-orange-300" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StepReview({
  form,
  selectedTags,
  riskScore,
  priorityRisk,
}: {
  form: FormState;
  selectedTags: RiskTag[];
  riskScore: number;
  priorityRisk: RiskTag | null;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-orange-400/30 bg-orange-500/10 p-4">
        <p className="text-[11px] font-bold text-orange-200">
          AI 사전 진단 (제출 직후 자동 송부)
        </p>
        <p className="mt-1 text-sm text-white">
          {form.institutionName || "기관"}의 선택 리스크 {selectedTags.length}
          개를 분석한 결과, 종합 리스크 지수는{" "}
          <span className="font-black">{riskScore}%</span> 입니다.{" "}
          {priorityRisk && (
            <>
              최우선 대응 과제는{" "}
              <span className="font-black">“{priorityRisk.label}”</span> 입니다.
            </>
          )}
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Summary label="신청 유형" value={form.mode === "lecture" ? "강의/컨설팅" : "사업 협력/파트너십"} />
        <Summary label="담당자" value={`${form.contactName || "-"} / ${form.contactEmail || "-"}`} />
        <Summary label="기관 규모" value={form.orgScale || "-"} />
        {form.mode === "lecture" ? (
          <>
            <Summary label="인원" value={`${form.participants || "-"}명`} />
            <Summary label="희망 일자" value={form.preferredDate || "-"} />
            <Summary
              label="희망 시간"
              value={
                form.preferredTimeStart && form.preferredTimeEnd
                  ? `${form.preferredTimeStart} ~ ${form.preferredTimeEnd}  (${calcDuration(form.preferredTimeStart, form.preferredTimeEnd) || "-"})`
                  : "-"
              }
            />
            <Summary label="장소" value={form.location || "-"} />
            <Summary label="AI 참여형 여부" value={form.aiParticipation === "ai-interactive" ? "AI 참여형 (Dialogue QR)" : form.aiParticipation === "lecture-focused" ? "강의 중심형" : "-"} />
          </>
        ) : (
          <>
            <Summary label="협업 목적" value={form.partnershipPurposes.join(", ") || "-"} />
            <Summary label="추진 시점" value={form.timeline || "-"} />
          </>
        )}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2">
      <p className="text-[11px] font-bold text-steel-300">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value}</p>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-orange-300">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value}</p>
    </div>
  );
}

/* ── 시간 범위 선택기 ──────────────────────────────────────────────── */

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 10, 20, 30, 40, 50];

function fmt2(n: number) {
  return String(n).padStart(2, "0");
}

function calcDuration(start: string, end: string): string {
  if (!start || !end) return "";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const total = (eh * 60 + em) - (sh * 60 + sm);
  if (total <= 0) return "";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

function TimeSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const hour = value ? parseInt(value.split(":")[0], 10) : -1;
  const min  = value ? parseInt(value.split(":")[1], 10) : -1;

  const setH = (h: number) =>
    onChange(`${fmt2(h)}:${fmt2(min >= 0 ? min : 0)}`);
  const setM = (m: number) =>
    onChange(`${fmt2(hour >= 0 ? hour : 9)}:${fmt2(m)}`);

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-black text-white">
        <Clock className="h-4 w-4 text-sky-300" />
        {label}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={hour >= 0 ? hour : ""}
          onChange={(e) => setH(Number(e.target.value))}
          className="flex-1 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-3 text-[15px] font-semibold text-white outline-none focus:border-sky-300/60"
        >
          <option value="">시</option>
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {fmt2(h)}시
            </option>
          ))}
        </select>
        <select
          value={min >= 0 ? min : ""}
          onChange={(e) => setM(Number(e.target.value))}
          className="flex-1 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-3 text-[15px] font-semibold text-white outline-none focus:border-sky-300/60"
        >
          <option value="">분</option>
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {fmt2(m)}분
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TimeRangePicker({
  start,
  end,
  onStartChange,
  onEndChange,
}: {
  start: string;
  end: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
}) {
  const duration = calcDuration(start, end);

  return (
    <div className="rounded-2xl border border-sky-300/20 bg-sky-500/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[13px] font-black text-white">
        <Clock className="h-4 w-4 text-sky-300" />
        희망 시간
        {duration && (
          <span className="ml-2 rounded-full border border-sky-300/40 bg-sky-500/20 px-3 py-0.5 text-[12px] font-bold text-sky-200">
            총 {duration}
          </span>
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <TimeSelect label="시작 시간" value={start} onChange={onStartChange} />
        <TimeSelect label="종료 시간" value={end} onChange={onEndChange} />
      </div>
      {start && end && !duration && (
        <p className="mt-2 text-[12px] text-rose-300">
          종료 시간은 시작 시간보다 늦어야 합니다.
        </p>
      )}
    </div>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "number" | "date";
  icon?: React.ComponentType<{ className?: string }>;
  select?: boolean;
  options?: string[];
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon: Icon,
  select,
  options,
}: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-black text-white">
        {Icon && <Icon className="h-4 w-4 text-orange-300" />}
        {label}
      </span>
      {select ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3.5 py-3 text-[15px] font-semibold text-white outline-none focus:border-orange-400/60"
        >
          <option value="">선택하세요</option>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-navy-900/60 px-3.5 py-3 text-[15px] font-semibold text-white placeholder:text-steel-500 outline-none focus:border-orange-400/60"
        />
      )}
    </label>
  );
}

/* ---------- AI curriculum generator (rule-based demo) ---------- */

type Module = {
  title: string;
  duration: string;
  summary: string;
  objectives: string[];
  outcomes: string[];
  track?: "opening" | "diagnosis" | "deep" | "live" | "closing";
};

function buildCurriculum(
  form: FormState,
  tags: RiskTag[],
  priority: RiskTag | null
): Module[] {
  const base: Module[] = [
    {
      title: "Opening · Ethics-Core AI 2.0 오리엔테이션",
      duration: "20분",
      summary: "참여 방식(Dialogue QR), 실습 환경, 학습 목표 공유.",
      objectives: [
        "AI 기반 청렴 파트너 플랫폼의 가치와 사용 흐름 이해",
        "개별 스마트폰으로 Dialogue 실시간 참여 환경 세팅",
      ],
      outcomes: [
        "참여자 100% QR 접속 완료 · 사전 문항 응답률 80%+",
        "학습 목표와 평가 루브릭에 대한 공감대 확보",
      ],
      track: "opening",
    },
  ];

  if (form.mode === "partnership") {
    return [
      ...base,
      {
        title: "파트너십 진단 · 기관 역량 & 데이터 자산 평가",
        duration: "30분",
        summary: `${form.orgScale || "귀 기관"} 규모 기준 Ethics-Core AI 도입 시 필요한 데이터 파이프라인과 운영 거버넌스를 점검합니다.`,
        objectives: [
          "기관 보유 데이터(상담/징계/민원)의 AI 활용 성숙도 진단",
          "거버넌스·개인정보·보안 요건 매핑",
        ],
        outcomes: [
          "AI 도입 성숙도 5단계 리포트 도출",
          "도입 리스크 Top 3 및 선결과제 식별",
        ],
        track: "diagnosis",
      },
      {
        title: "맞춤 협업 트랙 설계",
        duration: "40분",
        summary:
          form.partnershipPurposes.length > 0
            ? `선택 목적(${form.partnershipPurposes.join(", ")}) 기반 PoC → 파일럿 → 정식도입 경로를 도식화합니다.`
            : "PoC → 파일럿 → 정식도입 경로 및 KPI를 설계합니다.",
        objectives: [
          "PoC-파일럿-정식도입 3단계 경로와 의사결정 게이트 정의",
          "공동 KPI 및 성과 공유 구조 협의",
        ],
        outcomes: [
          "분기별 이정표·예산·책임 R&R이 포함된 초안 로드맵 산출",
          "상호 위험·이익 공유 조건(Win-Win) 합의",
        ],
        track: "deep",
      },
      {
        title: "8주 실행 로드맵 · 초기 KPI 4종",
        duration: "25분",
        summary:
          "리스크 탐지율, 신청 전환율, 교육 참여도, 리포트 활용도를 기준 KPI로 정의합니다.",
        objectives: [
          "즉시 착수 가능한 8주 실행 백로그 수립",
          "측정 가능한 초기 KPI 4종(탐지·전환·참여·활용) 정의",
        ],
        outcomes: [
          "Week 1~8 Task 15개 · 담당/산출물 명세 확정",
          "1차 성과 보고회(8주차) 준비물 합의",
        ],
        track: "closing",
      },
    ];
  }

  const categoryModule = (tag: RiskTag | null): Module | null => {
    if (!tag) return null;
    switch (tag.category) {
      case "청탁":
        return {
          title: "청탁금지법 3·5·10 실전 케이스 분석",
          duration: "45분",
          summary:
            "실제 판례 12건을 Ethics-Core Legal-Guide에서 즉시 호출, 상황별 의사결정 기준을 학습합니다.",
          objectives: [
            "3만원·5만원·10만원 금액기준의 실무 해석",
            "직무관련성·계속성·대가성 판단 3요소 체득",
          ],
          outcomes: [
            "애매한 상황 10종에 대해 즉시 판단 가능",
            "기관별 허용/금지 가이드라인 1p 요약본 산출",
          ],
          track: "deep",
        };
      case "이해충돌":
        return {
          title: "이해충돌 10대 트랩 · 즉시 회피 시나리오",
          duration: "50분",
          summary:
            "가족·지인·전직자·업무관련 주식 등 10가지 트랩을 역할극으로 경험합니다.",
          objectives: [
            "사적이해관계 신고 시점·양식·범위 숙지",
            "회피·기피 의무와 위반 시 법적 효과 이해",
          ],
          outcomes: [
            "직무배제 신청 샘플 문서 작성 완료",
            "기관 고위험 TOP3 이해충돌 포지션 식별",
          ],
          track: "deep",
        };
      case "갑질":
        return {
          title: "직장 내 괴롭힘 · 디지털 시대의 새로운 갑질",
          duration: "45분",
          summary:
            "카톡·메신저 증거 수집 → 고충처리 접수 프로세스까지 체험합니다.",
          objectives: [
            "법적 갑질 요건 3요소(우위·업무범위 초과·고통)",
            "디지털 증거(메신저·녹취)의 보존/제출 원칙",
          ],
          outcomes: [
            "갑질 자가진단 체크리스트 20문항 확보",
            "조직 내 익명 신고 채널 설계안",
          ],
          track: "deep",
        };
      case "예산·계약":
        return {
          title: "계약·입찰 공정성 · AI 리스크 대시보드 활용",
          duration: "50분",
          summary:
            "Intelligence Hub에서 조직 데이터를 불러와 비정상 패턴을 시각적으로 탐지합니다.",
          objectives: [
            "수의계약·분할계약·스펙 특정의 리스크 시그널 탐지",
            "Intelligence Hub 지표 해석 능력 확보",
          ],
          outcomes: [
            "기관 최근 1년 계약 데이터 Top 리스크 5건 자동 추출",
            "분기별 모니터링 루틴 SOP 수립",
          ],
          track: "deep",
        };
      case "인사·채용":
        return {
          title: "채용·인사 공정성 · 블라인드 원칙 실전",
          duration: "40분",
          summary: "편향 지표 진단과 평가 루브릭 설계까지 실습합니다.",
          objectives: [
            "공정채용 의무와 차별금지 규정 이해",
            "평가 루브릭의 편향 제거 설계 원칙",
          ],
          outcomes: [
            "기관 맞춤 평가표 초안 1종 완성",
            "채용 과정 리스크 히트맵 도출",
          ],
          track: "deep",
        };
      case "정보보안":
        return {
          title: "내부정보 유출 차단 · 행동강령 연계",
          duration: "35분",
          summary: "데이터 등급·접근권한·징계 사례를 연결해 학습합니다.",
          objectives: [
            "정보 등급별 취급 기준과 행동강령 연결 이해",
            "퇴직자·전직자 정보 보호 원칙",
          ],
          outcomes: [
            "정보 유출 Top 5 사례 징계수위 비교표 확보",
            "부서별 접근권한 재점검 체크리스트",
          ],
          track: "deep",
        };
      case "적극행정":
        return {
          title: "적극행정 면책 제도 · 소극행정 징계 예방",
          duration: "40분",
          summary:
            "적극행정 면책 성공·실패 사례 10건을 분석하고, 사전컨설팅·적극행정위원회 활용 전략을 실습합니다.",
          objectives: [
            "적극행정 면책 요건(4요소) 및 인정 기준 이해",
            "소극행정 징계 유형과 예방 체크리스트 체득",
          ],
          outcomes: [
            "기관 맞춤형 적극행정 실천 가이드 1p 도출",
            "사전컨설팅 신청 기준·절차 숙지",
          ],
          track: "deep",
        };
      case "규제개혁":
        return {
          title: "규제 샌드박스 · 숨은 규제 발굴 워크숍",
          duration: "35분",
          summary:
            "실증특례·임시허가·규제 샌드박스 신청 절차를 단계별로 익히고, 기관 내 불합리 규정을 직접 발굴합니다.",
          objectives: [
            "규제 샌드박스 3트랙(실증특례·임시허가·규제자유특구) 이해",
            "규제개혁 신문고·국민참여 채널 활용 방법",
          ],
          outcomes: [
            "기관 내 개선 가능 규제 Top 3 식별",
            "샌드박스 신청 초안 양식 작성 경험",
          ],
          track: "deep",
        };
    }
  };

  const mods = [
    ...base,
    categoryModule(priority),
    ...tags
      .filter((t) => t.id !== priority?.id)
      .slice(0, 2)
      .map((t) => categoryModule(t)),
  ].filter(Boolean) as Module[];

  mods.push({
    title: "Dialogue 라이브 세션 · 즉시 투표 & AI 감정 분석",
    duration: "30분",
    summary:
      "수강생 스마트폰으로 참여, 긍정·중립·부정 반응을 실시간 시각화하여 조직문화를 진단합니다.",
    objectives: [
      "실시간 딜레마 투표를 통한 조직 내 인식 격차 가시화",
      "AI 감정 분석으로 교육 만족·불안·동의 수준 진단",
    ],
    outcomes: [
      "참여자 평균 응답률 90%+ · 긍/부정 비율 리포트",
      "강의 후 '실행 의지 3문항' 평균 4.2/5.0 이상",
    ],
    track: "live",
  });

  mods.push({
    title: "Closing · 3개월 자기 점검 체크리스트",
    duration: "15분",
    summary:
      "선택 리스크별 90일 점검 체크리스트 자동 생성, 기관 관리자 메일로 발송됩니다.",
    objectives: [
      "90일 단위 자가 점검 루틴 내재화",
      "기관 관리자와 연결된 후속 모니터링 구조 이해",
    ],
    outcomes: [
      "리스크 유형별 맞춤 체크리스트 PDF 수령",
      "90일 뒤 Ethics-Core AI 재진단 일정 확정",
    ],
    track: "closing",
  });

  return mods;
}

/* ───────────────────────────────────────────────────────────────────
 *  Curriculum PDF-Report (제안서 전문판)
 *  - 모듈별 학습목표 / 기대효과 / 시간배분 총계
 *  - 브라우저 인쇄(PDF 저장) 지원
 * ─────────────────────────────────────────────────────────────────── */

function CurriculumReport({
  form,
  curriculum,
  selectedTags,
  priorityRisk,
  riskScore,
}: {
  form: FormState;
  curriculum: Module[];
  selectedTags: RiskTag[];
  priorityRisk: RiskTag | null;
  riskScore: number;
}) {
  const totalMinutes = curriculum.reduce((acc, m) => {
    const n = parseInt(m.duration.replace(/[^0-9]/g, ""), 10);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <div className="mt-6 space-y-4 print:space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-orange-400" />
          <p className="text-sm font-black text-white">
            AI 맞춤 커리큘럼 제안서 · 전문판
          </p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-500/10 px-3 py-1.5 text-[11px] font-bold text-orange-200 hover:bg-orange-500/20"
        >
          <Printer className="h-3.5 w-3.5" />
          PDF 저장 / 인쇄
        </button>
      </div>

      <article
        id="ethics-core-proposal"
        className="rounded-3xl border border-white/10 bg-gradient-to-b from-navy-900/80 to-navy-950/90 p-6 text-steel-100 shadow-xl print:border-none print:bg-white print:text-black print:shadow-none"
      >
        {/* HEADER */}
        <header className="flex flex-col gap-2 border-b border-white/10 pb-4 print:border-gray-300">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-[0.25em] text-orange-300 print:text-orange-600">
              Ethics-Core AI 2.0 · Tailored Curriculum Proposal
            </span>
            <span className="text-[11px] text-steel-400 print:text-gray-500">
              Document v{new Date().getFullYear()}-A · Confidential
            </span>
          </div>
          <h3 className="text-2xl font-black text-white print:text-black">
            {form.institutionName || "기관명"} · 맞춤형 청렴 교육 커리큘럼
            제안서
          </h3>
          <p className="text-[12px] text-steel-300 print:text-gray-700">
            본 제안서는 {selectedTags.length}개 주요 리스크 진단(AI 종합지수{" "}
            <b className="text-orange-300 print:text-orange-600">
              {riskScore}%
            </b>
            )과 기관 규모({form.orgScale || "미정"})를 바탕으로 Ethics-Core AI
            2.0 이 자동 생성한 제안서입니다. 모든 모듈은{" "}
            <b>학습목표 · 세부 활동 · 기대효과</b> 3단 구성을 따릅니다.
          </p>
        </header>

        {/* EXECUTIVE SUMMARY */}
        <section className="mt-4 grid gap-3 md:grid-cols-3">
          <SummaryTile
            icon={Target}
            label="최우선 과제"
            value={priorityRisk?.label ?? "리스크 선택 대기"}
            sub={priorityRisk ? `가중치 ${priorityRisk.weight}` : "-"}
          />
          <SummaryTile
            icon={Clock}
            label="총 교육 시간"
            value={`${totalMinutes}분`}
            sub={`${curriculum.length}개 모듈`}
          />
          <SummaryTile
            icon={ShieldCheck}
            label="종합 리스크 지수"
            value={`${riskScore}%`}
            sub={
              riskScore >= 70
                ? "HIGH · 집중 대응"
                : riskScore >= 40
                  ? "MID · 예방 강화"
                  : "LOW · 정기 점검"
            }
          />
        </section>

        {/* OBJECTIVE */}
        <section className="mt-5 rounded-2xl border border-white/5 bg-navy-950/50 p-4 print:border-gray-300 print:bg-gray-50">
          <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-orange-300 print:text-orange-600">
            <BookOpen className="h-3.5 w-3.5" />
            교육 개요 · Objective
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-white print:text-black">
            {form.goal?.trim() ||
              (form.mode === "lecture"
                ? `${form.institutionName || "귀 기관"}의 최근 부패 리스크 데이터를 반영한 맞춤형 시나리오 기반 60분 워크숍으로, 참여자가 실제 의사결정 상황에서 "무엇을·언제·어떻게" 판단할지를 체득하도록 설계했습니다.`
                : "귀 기관의 데이터 자산과 도입 성숙도를 기반으로, PoC → 파일럿 → 정식 도입의 3단계 협업 트랙을 설계합니다.")}
          </p>
        </section>

        {/* MODULES */}
        <section className="mt-5 space-y-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-orange-300 print:text-orange-600">
            모듈 구성 · Curriculum Modules
          </p>
          {curriculum.map((m, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-white/10 bg-navy-900/60 p-4 print:break-inside-avoid print:border-gray-300 print:bg-white"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-navy-700 to-orange-550 text-[11px] font-black text-white print:from-gray-700 print:to-orange-600">
                    M{idx + 1}
                  </span>
                  <h4 className="text-base font-black text-white print:text-black">
                    {m.title}
                  </h4>
                </div>
                <span className="rounded-full border border-orange-400/40 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-bold text-orange-200 print:border-orange-500 print:bg-orange-50 print:text-orange-700">
                  <Clock className="mr-1 inline h-3 w-3" />
                  {m.duration}
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-steel-200 print:text-gray-700">
                {m.summary}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ObjectiveBlock
                  icon={Target}
                  title="학습 목표"
                  color="orange"
                  items={m.objectives}
                />
                <ObjectiveBlock
                  icon={TrendingUp}
                  title="기대 효과"
                  color="emerald"
                  items={m.outcomes}
                />
              </div>
            </div>
          ))}
        </section>

        {/* FOOTER */}
        <footer className="mt-5 border-t border-white/10 pt-4 print:border-gray-300">
          <div className="flex flex-col gap-1 text-[11px] text-steel-400 md:flex-row md:items-center md:justify-between print:text-gray-600">
            <span>
              본 제안서는 Ethics-Core AI 2.0 엔진에 의해 자동 생성된 초안이며,
              확정 전 담당 컨설턴트의 검토·조정이 이루어집니다.
            </span>
            <span>
              신청 기관 담당자: {form.contactName || "-"} · {form.contactEmail || "-"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-sky-300/20 bg-sky-500/5 px-3 py-2 text-[11px] print:border-gray-300 print:bg-gray-50">
            <span className="font-black text-sky-200 print:text-sky-700">
              Ethics-Core AI 2.0 담당
            </span>
            <span className="text-steel-200 print:text-gray-700">
              {CONTACT.name}
            </span>
            <span className="text-steel-300 print:text-gray-600">
              📞 {CONTACT.phone}
            </span>
            <span className="text-steel-300 print:text-gray-600">
              ✉️ {CONTACT.email}
            </span>
          </div>
        </footer>
      </article>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-navy-900/60 p-3 print:border-gray-300 print:bg-gray-50">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-orange-300 print:text-orange-600" />
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-orange-300 print:text-orange-600">
          {label}
        </p>
      </div>
      <p className="mt-1.5 text-lg font-black text-white print:text-black">
        {value}
      </p>
      <p className="text-[11px] text-steel-400 print:text-gray-600">{sub}</p>
    </div>
  );
}

function ObjectiveBlock({
  icon: Icon,
  title,
  color,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  color: "orange" | "emerald";
  items: string[];
}) {
  const isOrange = color === "orange";
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        isOrange
          ? "border-orange-400/30 bg-orange-500/5 print:border-orange-400 print:bg-orange-50"
          : "border-emerald-400/30 bg-emerald-500/5 print:border-emerald-500 print:bg-emerald-50"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          className={`h-3.5 w-3.5 ${
            isOrange
              ? "text-orange-300 print:text-orange-600"
              : "text-emerald-300 print:text-emerald-700"
          }`}
        />
        <p
          className={`text-[10.5px] font-black uppercase tracking-wider ${
            isOrange
              ? "text-orange-300 print:text-orange-600"
              : "text-emerald-300 print:text-emerald-700"
          }`}
        >
          {title}
        </p>
      </div>
      <ul className="mt-1.5 space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[11.5px] leading-snug text-white print:text-black"
          >
            <span
              className={`mt-1 inline-block h-1 w-1 shrink-0 rounded-full ${
                isOrange ? "bg-orange-400" : "bg-emerald-400"
              }`}
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
