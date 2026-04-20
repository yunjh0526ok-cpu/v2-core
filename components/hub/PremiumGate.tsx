"use client";

/**
 *  components/hub/PremiumGate.tsx
 *  ──────────────────────────────
 *   Intelligence Hub 를 프리미엄 전용으로 보호하는 게이트.
 *   - 기본 상태(무료): 내부 콘텐츠는 블러 처리 + 업그레이드 팝업 오버레이
 *   - "샘플 데이터 보기"를 누르면 임시로 블러를 해제 (결제 유도용 미리보기)
 *   - "프리미엄 리포트 활성화하기"를 누르면 /pricing 으로 이동 (Stripe/PortOne 스캐폴드)
 *   - 활성화 여부는 localStorage("ethics_premium") 와 cookie("ethics_premium")
 *     를 병행해서 판단 (결제 API 가 cookie 를 셋팅)
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  Lock,
  Sparkles,
  ShieldCheck,
  ChevronRight,
  Eye,
  Gem,
  Zap,
  FileText,
  Brain,
  X,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

const LS_KEY = "ethics_premium";

type EntitlementState = "unknown" | "free" | "premium";

function readEntitlementSnapshot(): EntitlementState {
  if (typeof window === "undefined") return "unknown";
  try {
    const v = window.localStorage.getItem(LS_KEY);
    if (v === "active") return "premium";
    const cookie = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${LS_KEY}=`));
    if (cookie && cookie.split("=")[1] === "active") return "premium";
  } catch {
    /* ignore */
  }
  return "free";
}

/** 브라우저 storage / cookie 변경을 감지해 React state 로 동기화 */
function subscribeEntitlement(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener("ethics-premium-change", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("ethics-premium-change", handler);
  };
}

export default function PremiumGate({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(
    subscribeEntitlement,
    readEntitlementSnapshot,
    () => "unknown" as EntitlementState
  );
  const [sampleMode, setSampleMode] = useState(false);

  const onActivate = useCallback(() => {
    // 데모용: 사용자가 결제 없이 localStorage 로 직접 해제할 수 있는 개발자 모드
    try {
      window.localStorage.setItem(LS_KEY, "active");
      window.dispatchEvent(new Event("ethics-premium-change"));
    } catch {
      /* ignore */
    }
  }, []);

  // 아직 상태를 모를 때 짧은 스켈레톤
  if (state === "unknown") {
    return (
      <div className="rounded-3xl border border-white/10 bg-navy-900/50 p-8 text-center text-[13px] font-semibold text-steel-300">
        Intelligence Hub 로딩 중…
      </div>
    );
  }

  if (state === "premium") {
    return <>{children}</>;
  }

  // ── 무료 사용자: 블러 미리보기 + 업그레이드 모달 오버레이 ──
  return (
    <div className="relative">
      {/* 블러 미리보기 */}
      <div
        aria-hidden={!sampleMode}
        className={sampleMode ? "" : "premium-blur pointer-events-none select-none"}
      >
        {children}
      </div>

      {/* 샘플 모드 바 */}
      {sampleMode && (
        <div className="pointer-events-auto fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-2xl border border-sky-300/50 bg-navy-950/95 p-4 shadow-[0_24px_80px_-20px_rgba(125,211,252,0.55)] backdrop-blur-xl md:left-1/2 md:-translate-x-1/2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/40 bg-sky-500/10 px-2.5 py-1 text-[11.5px] font-black text-sky-200">
              <Eye className="h-3 w-3" />
              샘플 미리보기 중
            </span>
            <p className="flex-1 text-[13px] font-semibold text-white/90">
              실제 프리미엄 리포트는{" "}
              <span className="accent-text">AI가 실시간 생성한 조직 진단</span> 을 제공합니다.
            </p>
            <button
              type="button"
              onClick={() => setSampleMode(false)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11.5px] font-black text-white/85 hover:bg-white/10"
            >
              <X className="h-3 w-3" />
              닫기
            </button>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-3 py-1.5 text-[12px] font-black text-white sky-glow hover:opacity-95"
            >
              활성화하기
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* 업그레이드 모달 (샘플 모드 아닐 때만) */}
      {!sampleMode && (
        <div className="absolute inset-0 z-20 grid place-items-center p-4">
          <div className="gradient-border glass-strong relative w-full max-w-2xl overflow-hidden rounded-3xl bg-navy-950/95 p-7 md:p-9 sky-glow">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />

            <div className="relative">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-gradient-to-r from-sky-500/15 to-violet-500/15 px-3 py-1 text-[11.5px] font-black text-violet-100">
                  <Gem className="h-3.5 w-3.5" />
                  PREMIUM ONLY
                </span>
                <Lock className="h-4 w-4 text-sky-300" />
              </div>
              <h2 className="mt-4 text-[26px] font-black leading-tight text-white md:text-[34px]">
                우리 기관의 <span className="gradient-text">청렴 리스크</span>를
                <br />
                AI로 전수 진단하고 보고서를 <span className="gradient-text">자동 생성</span>하세요
              </h2>
              <p className="mt-4 text-[14.5px] font-semibold leading-relaxed text-white/85 md:text-[15.5px]">
                Intelligence Hub 는 Legal-Guide 상담 · Dialogue 토론 · Ethics-Drama
                설문 데이터를 통합 분석해, 이사회 제출 수준의{" "}
                <span className="accent-chip">맞춤 리포트</span>를 자동 산출합니다.
                무료 플랜에서는 프리뷰만 가능하며, 정식 활성화 후 전수 진단과
                PDF 내보내기가 열립니다.
              </p>

              <ul className="mt-5 grid gap-2.5 md:grid-cols-2">
                <FeatureRow
                  icon={<Brain className="h-4 w-4 text-sky-300" />}
                  title="Gemini Pro 전수 진단"
                  desc="기관 전체 14일 × 직무별 리스크 레이더"
                />
                <FeatureRow
                  icon={<FileText className="h-4 w-4 text-violet-300" />}
                  title="자동 보고서 PDF"
                  desc="이사회 · 감사부서 제출용 구조화 문서"
                />
                <FeatureRow
                  icon={<ShieldCheck className="h-4 w-4 text-sky-300" />}
                  title="부서별 리스크 비교"
                  desc="피어 기관 평균 대비 편차 하이라이트"
                />
                <FeatureRow
                  icon={<Zap className="h-4 w-4 text-violet-300" />}
                  title="긴급 조치 알림"
                  desc="CRITICAL 상담 발생 시 담당자 푸시"
                />
              </ul>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-5 py-3 text-[14.5px] font-black text-white sky-glow hover:opacity-95"
                >
                  <Sparkles className="h-4 w-4" />
                  프리미엄 리포트 활성화하기
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={() => setSampleMode(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300/50 bg-sky-500/10 px-4 py-3 text-[14px] font-black text-sky-100 hover:bg-sky-500/20"
                >
                  <Eye className="h-4 w-4" />
                  샘플 데이터 보기
                </button>
                <Link
                  href="/apply"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-[13px] font-black text-white/90 hover:bg-white/10"
                >
                  기관 상담 문의
                </Link>
              </div>

              <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-semibold text-white/60">
                <span>결제 수단: 신용카드 · 국민카드 · 계좌이체 · 세금계산서</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={onActivate}
                  className="text-[11px] font-black text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
                  title="개발자 모드: 결제 없이 프리미엄 해제"
                >
                  개발자 모드 해제
                </button>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureRow({
  icon,
  title,
  desc,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-sky-300/20 bg-navy-900/60 p-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-sky-500/20 to-violet-500/20">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-black text-white">{title}</p>
        <p className="text-[12.5px] font-semibold text-white/75">{desc}</p>
      </div>
    </li>
  );
}
