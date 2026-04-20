"use client";

/**
 *  components/landing/AdminReformMarquee.tsx
 *  ─────────────────────────────────────────────────────────────────────
 *   적극행정·규제개혁 흐르는 텍스트 배너 — "부패방지" 반대 축의 콘텐츠.
 *
 *   · 12개 키워드가 좌→우로 끊김없이 순환 (double track 방식)
 *   · 호버 시 일시정지, 클릭 시 해당 주제의 상세 팝업
 *   · 폰트 대폭 확대 (≥ 1.25rem) + 키워드 주황 강조
 *
 *   데이터: 국가법령정보 API 와 실제 사례 기반 요약 (내부 큐레이션).
 *          상세 페이지 도달 전 '맛보기' 용 — 정밀 분석은 Legal-Guide 로.
 */

import { useEffect, useState, useCallback } from "react";
import { saveHandoff, type ChatHandoff } from "@/lib/chatHandoff";
import {
  X,
  Scale,
  Sparkles,
  ExternalLink,
  Megaphone,
  Loader2,
  Brain,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

type ReformItem = {
  id: string;
  /** 헤드라인 (키워드 포함) */
  headline: string;
  /** 강조할 키워드들 — headline 안에서 정확히 일치해야 주황색 렌더됨 */
  highlights: string[];
  /** 분류 */
  kind: "면책확정" | "적극행정" | "청렴수상" | "규제혁신" | "주의" | "Merit";
  /** 팝업 본문 (Merit 는 없을 수 있음) */
  detail?: {
    lawBasis: string[]; // 법령 근거
    realCase: string; // 실제 사례 요약
    actionGuide: string[]; // 대응·활용 방법
  };
};

const ITEMS: ReformItem[] = [
  /* ── 메리트 홍보 문구 (3개) — 사례 사이사이에 배치 ──────── */
  {
    id: "merit-speed",
    kind: "Merit",
    highlights: ["법령 API", "10초"],
    headline: "법령 API + AI 가 10초 만에 분석하는 실전 방어법",
  },
  /* ── 팩트 사례들 ─────────────────────────────────────── */
  {
    id: "case-immunity-1",
    kind: "면책확정",
    highlights: ["면책 확정", "고의·중과실 없음"],
    headline:
      "면책 확정 · A시 복지담당, 긴급재난지원금 신속집행 — 고의·중과실 없음으로 무징계 종결",
    detail: {
      lawBasis: [
        "공공감사에 관한 법률 제23조의2 (적극행정에 대한 면책)",
        "적극행정 운영규정 제16조 (면책심사 절차)",
      ],
      realCase:
        "A시 복지담당 주무관이 코로나19 긴급재난지원금 지급 과정에서 내부 절차보다 신속한 결정으로 수급자 3,200명의 누락을 방지. 일부 서류 불비 지적에도 '공공 이익 + 고의·중과실 없음' 판단으로 면책 확정.",
      actionGuide: [
        "결재 시 '적극행정 적용 의사' 를 문서에 명시할 것.",
        "적극행정지원위 사전컨설팅 의견서를 결재 첨부문서로 항상 보관.",
        "감사 개시 시 '적극행정 면책 신청서' 즉시 제출.",
      ],
    },
  },
  {
    id: "case-award-1",
    kind: "청렴수상",
    highlights: ["청렴도 1등급", "4년 연속"],
    headline:
      "청렴도 1등급 · B 공공기관, 4년 연속 최우수 — 부패사건 zero · 내부신고 보호율 100%",
    detail: {
      lawBasis: [
        "부패방지권익위법 제12조 (공공기관 청렴도 측정)",
        "공익신고자 보호법 제13조 (신분보장)",
      ],
      realCase:
        "B 공공기관이 국민권익위원회 종합청렴도 평가에서 4년 연속 1등급 달성. 내부 신고 접수 14건 전건 신분 보장, 갑질 예방 상시 교육이 핵심 요인으로 분석됨.",
      actionGuide: [
        "신고 접수 → 조사 → 조치 프로세스를 7일 내 SLA 로 운영.",
        "신고자 보호 담당관을 감사부서와 분리하여 이해충돌 차단.",
        "매 분기 갑질·이해충돌 자가진단 시행 + 리스크 맵 공개.",
      ],
    },
  },
  {
    id: "case-active-1",
    kind: "적극행정",
    highlights: ["적극행정 성공", "6개월 → 3주"],
    headline:
      "적극행정 성공 · C 기관, 혁신조달 수의계약 특례로 도입기간 6개월 → 3주 단축",
    detail: {
      lawBasis: [
        "중소기업제품 구매촉진법 (혁신제품 지정)",
        "국가계약법 시행령 제26조 (수의계약 요건)",
      ],
      realCase:
        "C 공공기관이 조달청 '혁신제품 지정' 스타트업과 2천만원 규모 수의계약 체결. 통상 6개월 조달 절차가 3주로 단축되었고, 시범 도입 후 1년 내 정식구매 전환.",
      actionGuide: [
        "조달청 혁신장터에서 '혁신제품 지정' 여부 사전 확인.",
        "시범구매 제도 적용 → 성과 데이터 축적 → 정식 계약 전환.",
        "도입 성과는 적극행정 우수사례 평가에 활용.",
      ],
    },
  },
  {
    id: "merit-insight",
    kind: "Merit",
    highlights: ["20년 내공", "성공 서사"],
    headline: "20년 내공의 성공 서사가 당신의 적극행정을 보호합니다",
  },
  {
    id: "case-reform-1",
    kind: "규제혁신",
    highlights: ["규제 샌드박스", "혁신"],
    headline:
      "규제혁신 · D 스타트업, 규제 샌드박스로 2년 실증 → 항공법 예외 드론배송 합법화",
    detail: {
      lawBasis: [
        "행정규제기본법 제20조의2 (규제 샌드박스)",
        "정보통신 진흥 및 융합 활성화 특별법",
      ],
      realCase:
        "D 스타트업이 ICT 규제 샌드박스로 드론 배송 2년 실증특례 승인. 기존 항공법상 불가했던 도서지역 배송을 합법 운행하여 연 1.2만 건 배송 실적 달성.",
      actionGuide: [
        "실증 범위·안전장치·기간을 구체적으로 명시해서 심사 통과율↑.",
        "사고·장애 발생 시 즉시 신고 체계 구축 — 특례 유지 조건.",
        "실증 데이터를 정식 규제개선 입법안의 근거로 활용.",
      ],
    },
  },
  {
    id: "case-immunity-2",
    kind: "면책확정",
    highlights: ["면책 확정", "사전컨설팅"],
    headline:
      "면책 확정 · E 공사 계약담당자, 사전컨설팅 의견대로 집행 — 감사원 면책 확정",
    detail: {
      lawBasis: [
        "적극행정 운영규정 제9조 (사전컨설팅 감사)",
        "공공감사에 관한 법률 제8조의2",
      ],
      realCase:
        "E 공사 계약담당자가 긴급 자재 수급 건으로 감사원에 사전컨설팅 요청 → 의견서 범위 내 집행. 사후 정기감사에서 '의견서 범위 내 집행'으로 면책 확정, 조직 전체 사전컨설팅 활용률 2배 증가.",
      actionGuide: [
        "의사결정 전 감사부서·감사원·법제처 중 적합한 창구에 공문 접수.",
        "의견서는 결재라인 전 구간에 첨부 보관.",
        "의견서 범위를 벗어나는 집행은 면책 효력 상실.",
      ],
    },
  },
  {
    id: "merit-budget",
    kind: "Merit",
    highlights: ["예산 오남용 zero", "수직상승"],
    headline: "예산 오남용 zero, 기관 청렴도 수직상승 솔루션",
  },
  {
    id: "case-active-2",
    kind: "적극행정",
    highlights: ["73% 단축", "대기 4시간 → 4분"],
    headline:
      "적극행정 성공 · F 시청 민원실 디지털 개방 — 대기시간 4시간 → 4분 · 연간 73% 단축",
    detail: {
      lawBasis: [
        "전자정부법 제15조 (행정정보의 전자적 처리)",
        "개인정보보호법 제29조 (안전성 확보조치)",
      ],
      realCase:
        "F 시청이 민원 증명서 발급을 모바일·챗봇 채널로 개방. 연간 방문민원 73% 감소, 적극행정 우수사례 표창 수상 및 기관 청렴도 평가 가점 획득.",
      actionGuide: [
        "분기별 '방문 → 온라인' 전환 가능성 점검.",
        "개인정보 안전성 확보조치를 시스템 설계 초기부터 포함.",
        "공공마이데이터 연계로 서류 제출 자체를 제거.",
      ],
    },
  },
  {
    id: "case-award-2",
    kind: "청렴수상",
    highlights: ["신고자 보호", "100%"],
    headline:
      "청렴수상 · G 광역시, 공익신고자 보호 100% 달성 — 권익위 신분보장 우수기관 선정",
    detail: {
      lawBasis: [
        "공익신고자 보호법 제13조·제15조 (신분보장·보호조치)",
        "부패방지권익위법 제62조의2 (익명 신고)",
      ],
      realCase:
        "G 광역시가 공익신고자 8건 전건 신분 보장, 불이익 조치 zero. 권익위 '공익신고자 보호 우수기관' 으로 선정되어 타 기관 벤치마킹 모델이 됨.",
      actionGuide: [
        "신고 접수부터 조치까지 외부 감독위원이 교차 검증.",
        "신고자 담당관·감사부서 조직분리로 이해충돌 원천 차단.",
        "분기별 신분보장 이행 현황을 외부 공개.",
      ],
    },
  },
  {
    id: "case-active-3",
    kind: "적극행정",
    highlights: ["적극행정", "2.3억 절감"],
    headline:
      "적극행정 · H 부처, Sunset + Review 로 묵은 인증제도 일몰 — 연 2.3억 규제비용 절감",
    detail: {
      lawBasis: [
        "행정규제기본법 제8조 (규제의 존속기한)",
        "규제영향분석서 작성지침",
      ],
      realCase:
        "H 부처가 5년 일몰조항을 삽입한 인증제도를 자동 재검토 시점에 온라인 자진신고로 전환. 민간 부담 연 2.3억 절감 및 '규제혁신 우수사례' 선정.",
      actionGuide: [
        "새 규제 입안 시 Sunset(일몰) 조항을 기본값으로.",
        "재검토 기준을 실증 데이터 중심으로 명시.",
        "3년 단위로 외부 위원회 존속 평가 루틴 가동.",
      ],
    },
  },
];

export default function AdminReformMarquee() {
  const [active, setActive] = useState<ReformItem | null>(null);

  // ESC 로 닫기
  const onKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setActive(null);
  }, []);
  useEffect(() => {
    if (!active) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onKey]);

  // 2회 복제해서 seamless loop
  const track = [...ITEMS, ...ITEMS];

  return (
    <>
      <section
        className="gradient-border group relative overflow-hidden rounded-2xl bg-gradient-to-r from-navy-950/90 via-navy-900/90 to-navy-950/90 py-3 md:py-4"
        aria-label="적극행정·규제개혁 헤드라인"
      >
        <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-navy-950/95 to-transparent md:w-28" />
        <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-navy-950/95 to-transparent md:w-28" />

        <div className="relative z-0 mb-1 flex items-center gap-2 px-4 md:px-6">
          <Megaphone className="h-4 w-4 text-violet-300" />
          <p className="text-[10.5px] font-black uppercase tracking-[0.2em]">
            <span className="accent-text">
              Active Admin · Regulatory Reform · Live Ticker
            </span>
          </p>
          <span className="ml-auto hidden text-[10px] font-bold text-steel-400 md:inline">
            클릭하면 법령 근거 + 실제 사례 + 대응 방법을 확인할 수 있어요
          </span>
        </div>

        <div className="admin-reform-track pl-6 pr-6">
          {track.map((it, i) => (
            <MarqueeChip
              key={`${it.id}-${i}`}
              item={it}
              onClick={() => {
                if (it.detail) setActive(it);
              }}
            />
          ))}
        </div>
      </section>

      {active?.detail && (
        <ReformDetailModal
          item={active as ReformItem & { detail: NonNullable<ReformItem["detail"]> }}
          onClose={() => setActive(null)}
        />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Chip (한 개의 흐르는 카드)
 * ═══════════════════════════════════════════════════════════════════ */

function MarqueeChip({
  item,
  onClick,
}: {
  item: ReformItem;
  onClick: () => void;
}) {
  const isMerit = item.kind === "Merit";

  const kindClr =
    item.kind === "면책확정"
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-200"
      : item.kind === "적극행정"
        ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
        : item.kind === "청렴수상"
          ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100"
          : item.kind === "규제혁신"
            ? "border-indigo-400/50 bg-indigo-500/15 text-indigo-200"
            : item.kind === "주의"
              ? "border-rose-400/50 bg-rose-500/15 text-rose-200"
              : "border-violet-300/60 bg-gradient-to-r from-sky-500/20 via-indigo-500/25 to-violet-500/25 text-violet-100";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group/chip flex shrink-0 items-center gap-3 rounded-2xl border px-4 py-2.5 text-left transition-all hover:-translate-y-0.5 ${
        isMerit
          ? "border-violet-300/50 bg-gradient-to-r from-navy-900/90 via-violet-900/35 to-navy-900/90 hover:border-violet-300/80 hover:shadow-[0_0_38px_-8px_rgba(167,139,250,0.55)]"
          : "border-white/10 bg-navy-900/70 hover:border-sky-300/60 hover:bg-navy-800/90"
      }`}
    >
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black ${kindClr}`}
      >
        {item.kind === "면책확정" && <Scale className="h-3 w-3" />}
        {item.kind === "규제혁신" && <Sparkles className="h-3 w-3" />}
        {item.kind === "적극행정" && <Sparkles className="h-3 w-3" />}
        {item.kind === "청렴수상" && <Sparkles className="h-3 w-3" />}
        {item.kind === "Merit" && <Megaphone className="h-3 w-3" />}
        {item.kind}
      </span>
      <HighlightedText
        text={item.headline}
        highlights={item.highlights}
        className={`font-black leading-tight ${
          isMerit
            ? "text-[1.1rem] text-violet-100 md:text-[1.32rem]"
            : "text-[1rem] text-white md:text-[1.2rem]"
        }`}
      />
      {item.detail && (
        <span className="ml-1 hidden items-center gap-1 text-[11px] font-bold text-sky-200 group-hover/chip:flex">
          상세
          <ExternalLink className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}

function HighlightedText({
  text,
  highlights,
  className,
}: {
  text: string;
  highlights: string[];
  className?: string;
}) {
  // 긴 키워드부터 치환 (중복 방지)
  const sorted = [...highlights].sort((a, b) => b.length - a.length);
  const parts: Array<{ t: string; hit: boolean }> = [{ t: text, hit: false }];

  for (const kw of sorted) {
    const next: typeof parts = [];
    for (const p of parts) {
      if (p.hit) {
        next.push(p);
        continue;
      }
      const segs = p.t.split(kw);
      segs.forEach((s, i) => {
        if (s) next.push({ t: s, hit: false });
        if (i < segs.length - 1) next.push({ t: kw, hit: true });
      });
    }
    parts.splice(0, parts.length, ...next);
  }

  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.hit ? (
          <span key={i} className="accent-chip">
            {p.t}
          </span>
        ) : (
          <span key={i}>{p.t}</span>
        )
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════
 *  Detail Modal
 * ═══════════════════════════════════════════════════════════════════ */

function ReformDetailModal({
  item,
  onClose,
}: {
  item: ReformItem & { detail: NonNullable<ReformItem["detail"]> };
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "loading" | "deep">("idle");

  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => setPhase("deep"), 1200);
    return () => clearTimeout(t);
  }, [phase]);

  // 4섹션 narrative 조립 → sessionStorage 저장용
  function buildReformHandoff(): ChatHandoff {
    const kindRisk: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
      면책확정: "LOW",
      적극행정: "LOW",
      청렴수상: "LOW",
      규제혁신: "LOW",
      주의: "HIGH",
      Merit: "LOW",
    };
    const riskLevel = kindRisk[item.kind] ?? "LOW";
    const riskScore = riskLevel === "HIGH" ? 78 : 22;

    const narrative = [
      "[상황 진단]",
      `${item.headline}\n\n${item.detail.realCase}`,
      "",
      "[법령 근거]",
      item.detail.lawBasis.map((l) => `• ${l}`).join("\n"),
      "",
      "[강사님의 한 줄 조언]",
      "적극행정은 '사전 기록'이 면책의 핵심입니다. 사전컨설팅 의견서·적극행정위원회 의결서를 결재 첨부문서로 항상 보관하고, 의견서 범위를 벗어난 집행은 면책 효력이 상실됩니다.",
      "",
      "[권고 조치]",
      item.detail.actionGuide.map((g, i) => `${i + 1}. ${g}`).join("\n"),
    ].join("\n");

    return {
      question: item.headline,
      riskScore,
      riskLevel,
      narrative,
      summary: item.detail.realCase,
      lawBasis: item.detail.lawBasis.map((l) => {
        const [statute, ...rest] = l.split("(");
        return { statute: statute.trim(), clause: rest.length ? `(${rest.join("(")}` : "" };
      }),
      recommendations: item.detail.actionGuide,
      keyIssues: item.detail.lawBasis,
    };
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-navy-950/82 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-strong relative w-full max-w-2xl overflow-y-auto rounded-3xl border border-sky-300/40"
        style={{ maxHeight: "90vh" }}
      >
        {/* 분석 중 오버레이 */}
        {phase === "loading" && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-navy-950/85 backdrop-blur-sm">
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

        <div className="relative p-6 md:p-7">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-navy-900/60 text-steel-200 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-sky-300/50 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-widest text-sky-200">
              {item.kind}
            </span>
            <span className="text-[11.5px] font-black uppercase tracking-[0.22em]">
              <span className="accent-text">Active Admin · Reform Brief</span>
            </span>
          </div>
          <HighlightedText
            text={item.headline}
            highlights={item.highlights}
            className="mt-3 block text-[24px] font-black leading-tight text-white md:text-[28px]"
          />

          <div className="mt-6 space-y-5">
            <Section
              title="법령 근거"
              icon={<Scale className="h-4 w-4 text-sky-300" />}
            >
              <ul className="space-y-1.5">
                {item.detail.lawBasis.map((l, i) => (
                  <li
                    key={i}
                    className="rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2.5 text-[14.5px] font-semibold leading-relaxed text-white/95"
                  >
                    <span className="mr-2 font-black">
                      <span className="accent-text">§</span>
                    </span>
                    {l}
                  </li>
                ))}
              </ul>
            </Section>

            <Section
              title="실제 사례"
              icon={<Sparkles className="h-4 w-4 text-violet-300" />}
            >
              <p className="rounded-2xl border border-sky-300/20 bg-sky-500/5 px-4 py-3 text-[14.5px] font-semibold leading-relaxed text-white/95">
                {item.detail.realCase}
              </p>
            </Section>

            <Section
              title="대응 · 활용 방법"
              icon={<Megaphone className="h-4 w-4 text-violet-300" />}
            >
              <ol className="space-y-2">
                {item.detail.actionGuide.map((g, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-navy-900/60 px-3 py-2.5 text-[15px] font-semibold leading-relaxed text-white/95"
                  >
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500/30 to-violet-500/30 text-[12px] font-black text-white">
                      {i + 1}
                    </span>
                    <span>{g}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          {/* ══════════ Gemini 심층 보강 (deep) ══════════ */}
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
                위 Brief 는 <b className="accent-text">{item.detail.lawBasis[0]}</b>
                를 1차 근거로 하며, 유사 공공기관 실제 집행 사례에서{" "}
                <b className="text-white">면책·무징계</b> 결론이 다수 확인됩니다.
                정확한 적용을 위해 Legal-Guide 챗에서 동일 상황을 한 줄로
                입력하시면 조문·판례·리스크%·즉시 조치가 한 번에 출력됩니다.
              </p>

              <Link
                href="/legal-guide"
                onClick={() => {
                  saveHandoff(buildReformHandoff());
                  onClose();
                }}
                className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-3 text-[14.5px] font-black text-white sky-glow hover:opacity-95"
              >
                Legal-Guide 챗으로 이어서 상담 계속하기
                <ChevronRight className="h-4 w-4" />
              </Link>
            </section>
          )}

          {phase !== "deep" && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/30 bg-navy-900/60 px-4 py-3">
              <p className="text-[14px] font-semibold text-white/90">
                정확한 적용 여부는{" "}
                <span className="accent-text">Legal-Guide</span> 심층 진단으로
                확인하세요.
              </p>
              <button
                type="button"
                onClick={() => setPhase("loading")}
                disabled={phase === "loading"}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-4 py-2.5 text-[13.5px] font-black text-white sky-glow disabled:opacity-60"
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
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-black uppercase tracking-widest">
          <span className="accent-text">{title}</span>
        </p>
      </div>
      {children}
    </div>
  );
}
