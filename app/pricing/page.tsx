"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Gem,
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Sparkles,
  Phone,
} from "lucide-react";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

type Plan = "institution-premium" | "institution-enterprise";

const PLANS: {
  id: Plan;
  name: string;
  price: string;
  monthly: string;
  headline: string;
  highlights: string[];
  recommended?: boolean;
}[] = [
  {
    id: "institution-premium",
    name: "Premium",
    price: "월 49만원",
    monthly: "₩490,000 / 월",
    headline: "중소 규모 기관 · 부서 단위 청렴 리스크 관리",
    highlights: [
      "Intelligence Hub 전 기능",
      "Gemini Pro 자동 리포트 (월 10회)",
      "부서별 리스크 레이더 · 추이",
      "PDF 내보내기 · 이사회 템플릿",
      "Legal-Guide 상담 월 500건",
    ],
  },
  {
    id: "institution-enterprise",
    name: "Enterprise",
    price: "월 190만원 ~",
    monthly: "₩1,900,000+ / 월",
    headline: "중앙부처 · 광역지자체 · 공공기관",
    recommended: true,
    highlights: [
      "Premium 의 모든 기능",
      "Gemini Pro 리포트 무제한",
      "전담 컨설턴트 온보딩 (2회)",
      "부처 맞춤 대시보드 + API 연동",
      "감사부서 · 국회 제출용 리포트 보강",
      "24/7 긴급 CRITICAL 푸시 알림",
    ],
  },
];

export default function PricingPage() {
  const [plan, setPlan] = useState<Plan>("institution-premium");
  const [provider, setProvider] =
    useState<"demo" | "stripe" | "portone">("demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(
          json?.hint || json?.error || `결제 세션 생성 실패 (HTTP ${res.status})`
        );
      }
      if (json.redirectUrl) {
        window.location.href = json.redirectUrl;
        return;
      }
      if (json.provider === "portone") {
        // TODO: PortOne V2 SDK 로드 후 PortOne.requestPayment(json.publicParams) 호출
        setError(
          "PortOne 연동 블록은 환경변수 설정 후 activate 됩니다. (publicParams 응답 수신 완료)"
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Intelligence Hub", href: "/intelligence-hub" },
          { label: "프리미엄 활성화" },
        ]}
      />

      {/* HERO */}
      <section className="gradient-border glass-strong relative overflow-hidden rounded-3xl p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/50 bg-gradient-to-r from-sky-500/15 to-violet-500/15 px-3 py-1 text-[11.5px] font-black text-violet-100">
            <Gem className="h-3.5 w-3.5" />
            INTELLIGENCE HUB · PREMIUM
          </span>
          <h1 className="mt-3 text-[28px] font-black leading-tight text-white md:text-[40px]">
            우리 기관의 <span className="gradient-text">청렴 리스크</span>를
            <br className="hidden md:block" />
            AI로 전수 진단하고 <span className="gradient-text">보고서를 자동 생성</span>하세요
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] font-semibold leading-relaxed text-white/85 md:text-[16.5px]">
            Legal-Guide 상담 · Dialogue 토론 · Ethics-Drama 퀴즈 데이터를 통합해,
            이사회 제출 수준의 <span className="accent-chip">맞춤 리포트</span> 를
            매월 자동 산출합니다. 무료 플랜에서는 프리뷰만 가능하며 결제 즉시
            Intelligence Hub 전 기능이 잠금 해제됩니다.
          </p>
        </div>
      </section>

      {/* PLAN CARDS */}
      <section className="grid gap-4 md:grid-cols-2">
        {PLANS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlan(p.id)}
            className={`text-left transition-all ${
              plan === p.id
                ? "gradient-border sky-glow"
                : "border border-white/10"
            } relative overflow-hidden rounded-3xl bg-navy-900/60 p-6`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-black uppercase tracking-[0.22em]">
                  <span className="accent-text">{p.name}</span>
                  {p.recommended && (
                    <span className="ml-2 rounded-full border border-violet-400/50 bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-black text-violet-100">
                      추천
                    </span>
                  )}
                </p>
                <p className="mt-2 text-[24px] font-black text-white md:text-[30px]">
                  {p.price}
                </p>
                <p className="text-[12px] font-semibold text-white/70">
                  {p.monthly}
                </p>
              </div>
              <span
                className={`grid h-10 w-10 place-items-center rounded-xl border ${
                  plan === p.id
                    ? "border-sky-300/60 bg-gradient-to-br from-sky-500/25 to-violet-500/25 text-white"
                    : "border-white/10 bg-white/5 text-steel-300"
                }`}
              >
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
            <p className="mt-3 text-[14px] font-semibold text-white/85">
              {p.headline}
            </p>
            <ul className="mt-4 space-y-2">
              {p.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2 text-[13.5px] font-semibold text-white/90"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gradient-to-r from-sky-400 to-violet-400" />
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </button>
        ))}
      </section>

      {/* PROVIDER + CHECKOUT */}
      <section className="gradient-border glass-strong rounded-3xl p-6 md:p-7">
        <p className="text-[12.5px] font-black uppercase tracking-[0.22em]">
          <span className="accent-text">결제 수단 선택</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: "demo", label: "데모 결제 (QA)" },
            { id: "stripe", label: "Stripe (해외 카드)" },
            { id: "portone", label: "PortOne · 아임포트 (국내 카드 · 계좌)" },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setProvider(p.id as "demo" | "stripe" | "portone")
              }
              className={`rounded-xl px-3.5 py-2 text-[13px] font-black transition-all ${
                provider === p.id
                  ? "bg-gradient-to-r from-sky-500/25 to-violet-500/25 text-white sky-glow"
                  : "border border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={startCheckout}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-violet-500 px-5 py-3 text-[14.5px] font-black text-white sky-glow disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            지금 활성화하기
            <ChevronRight className="h-4 w-4" />
          </button>
          <Link
            href="/apply"
            className="inline-flex items-center gap-1.5 rounded-xl border border-sky-300/50 bg-sky-500/10 px-4 py-3 text-[13.5px] font-black text-sky-100 hover:bg-sky-500/20"
          >
            <Phone className="h-4 w-4" />
            기관 견적 문의
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-300" />
            SSL · 결제 정보는 서버에 저장되지 않습니다
          </span>
        </div>
        {error && (
          <p className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3 text-[12.5px] font-semibold text-amber-100">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
