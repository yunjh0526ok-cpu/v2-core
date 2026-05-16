"use client";

import { Suspense, useState } from "react";
import { MessageSquare, FileSearch, Scale, Shield, Lightbulb, Gavel } from "lucide-react";
import LegalChatbot from "@/components/legal/LegalChatbot";
import DeepDiagnoseForm from "@/components/legal/DeepDiagnoseForm";
import JudgmentAnalysis from "@/components/legal/JudgmentAnalysis";
import LegalPrecedentMarquee from "@/components/legal/LegalPrecedentMarquee";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

type Tab = "chat" | "deep" | "judgment";

export default function LegalGuidePage() {
  const [tab, setTab] = useState<Tab>("chat");

  // 탭별로 Breadcrumbs 두 번째 라벨을 다르게 — "Legal-Guide > 부패방어 가이드(Legal Chat)"
  // 또는 "Legal-Guide > 적극행정 가이드(Deep Diagnose)" 로 노출
  const crumbItems =
    tab === "chat"
      ? [
          { label: "Legal-Guide", href: "/legal-guide" },
          { label: "부패방어 가이드 · Legal Chat" },
        ]
      : tab === "judgment"
      ? [
          { label: "Legal-Guide", href: "/legal-guide" },
          { label: "판결문 심층분석" },
        ]
      : [
          { label: "Legal-Guide", href: "/legal-guide" },
          { label: "적극행정 가이드 · Deep Diagnose" },
        ];

  return (
    <div className="min-w-0 space-y-5 overflow-x-clip md:space-y-6 break-keep">
      <Breadcrumbs items={crumbItems} />

      {/* HERO */}
      <section className="gradient-border glass-strong relative overflow-hidden rounded-3xl p-5 md:p-7">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative min-w-0">
          <p className="text-[12px] font-black uppercase tracking-[0.22em] break-keep">
            <span className="accent-text">
              Legal-Guide · 실전형 법률 방어·대응 시스템
            </span>
          </p>
          <h1 className="mt-3 break-keep text-[24px] font-black leading-tight text-white sm:text-[28px] md:text-[40px]">
            <span className="accent-chip">부패 방지</span>부터{" "}
            <span className="gradient-text">적극행정 면책</span>까지,
            <br className="hidden md:block" />
            공직자 실무 현장의{" "}
            <span className="accent-chip">모든 법률 문제</span>를 한 곳에서
          </h1>
          <p className="mt-4 max-w-3xl break-keep text-[14.5px] leading-relaxed text-white/85 md:text-[16.5px]">
            <b className="text-white">국가법령 API + Gemini Pro</b> 하이브리드.
            간단한 상담은 <b className="text-white">Legal Chat</b>, 구체적
            상황에는 <span className="accent-chip">Deep Diagnose(심층 진단)</span> 로
            법률 검토 보고서 수준의{" "}
            <span className="accent-chip">실전 대응 가이드</span>를 받으세요.
          </p>

          {/* 두 축 타일 */}
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <AxisTile
              tone="sky"
              icon={<Shield className="h-5 w-5" />}
              title="부패 방지 · 법률 방어"
              desc="청탁 · 이해충돌 · 갑질 · 금품 · 복무 8대 유형 대응"
              highlights={["보호", "방어"]}
            />
            <AxisTile
              tone="violet"
              icon={<Lightbulb className="h-5 w-5" />}
              title="적극 행정 · 규제 혁신"
              desc="면책 제도 · 사전컨설팅 · 실증특례 · 규제개혁 · 예산 집행"
              highlights={["면책", "예산", "혁신"]}
            />
          </div>
        </div>
      </section>


      {/* TAB SWITCH */}
      <div className="flex w-full min-w-0 flex-wrap gap-2 rounded-2xl border border-white/10 bg-navy-900/60 p-2">
        <TabBtn
          active={tab === "chat"}
          onClick={() => setTab("chat")}
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          label="Legal Chat · 빠른 상담"
          sub="한 줄 질문 → 즉시 리스크% + 근거"
        />
        <TabBtn
          active={tab === "deep"}
          onClick={() => setTab("deep")}
          icon={<FileSearch className="h-3.5 w-3.5" />}
          label="Deep Diagnose · 심층 진단"
          sub="구조화 입력 → PDF 리포트 형태 분석"
        />
        <TabBtn
          active={tab === "judgment"}
          onClick={() => setTab("judgment")}
          icon={<Gavel className="h-3.5 w-3.5" />}
          label="판결문 심층분석"
          sub="실제 판결·결정례 3건 ①②③④⑤ 심층 해설"
        />
      </div>

      {/* ── 탭별 질문 마퀴 — 판결문 탭에서는 숨김 ── */}
      {tab !== "judgment" && (
        <div className="min-w-0">
          {tab === "chat" ? (
            <LegalPrecedentMarquee
              filter="corruption"
              title="부패방어 · 실시간 질문 마퀴"
              subtitle="청탁 · 이해충돌 · 복무 · 징계 실전 사례 — 클릭하면 AI 리포트"
            />
          ) : (
            <LegalPrecedentMarquee
              filter="active-admin"
              title="적극행정 가이드 · 기관 맞춤 사례"
              subtitle="적극행정 · 소극행정 · 규제개혁 · 면책 성공·실패 패턴"
            />
          )}
        </div>
      )}

      <Suspense
        fallback={
          <div className="glass rounded-2xl p-6 text-sm text-steel-300">
            불러오는 중…
          </div>
        }
      >
        {tab === "chat" ? (
          <LegalChatbot />
        ) : tab === "judgment" ? (
          <JudgmentAnalysis />
        ) : (
          <DeepDiagnoseForm />
        )}
      </Suspense>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
        active
          ? "bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-violet-500/25 sky-glow"
          : "hover:bg-white/[0.03]"
      }`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
          active
            ? "bg-sky-500/20 text-sky-200"
            : "bg-white/5 text-steel-300"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`break-keep text-[14.5px] font-black md:text-[16px] ${
            active ? "text-white" : "text-steel-100"
          }`}
        >
          {label}
        </p>
        <p className="break-keep text-[12px] text-steel-300">{sub}</p>
      </div>
    </button>
  );
}

function AxisTile({
  tone,
  icon,
  title,
  desc,
  highlights = [],
}: {
  tone: "sky" | "violet";
  icon: React.ReactNode;
  title: string;
  desc: string;
  highlights?: string[];
}) {
  const ring = tone === "sky" ? "border-sky-300/40" : "border-violet-400/40";
  const chip =
    tone === "sky"
      ? "bg-sky-500/15 text-sky-200"
      : "bg-violet-500/15 text-violet-200";

  const sorted = [...highlights].sort((a, b) => b.length - a.length);
  const parts: { t: string; hit: boolean }[] = [{ t: desc, hit: false }];
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
      <div
      className={`flex min-w-0 items-center gap-3 rounded-2xl border ${ring} bg-navy-900/50 p-4`}
    >
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${chip}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[16px] font-black text-white break-keep md:text-[17px]">
          {title}
        </p>
        <p className="mt-0.5 whitespace-normal break-keep text-[14px] leading-snug text-white/90">
          {parts.map((p, i) =>
            p.hit ? (
              <span key={i} className="accent-chip">
                {p.t}
              </span>
            ) : (
              <span key={i}>{p.t}</span>
            )
          )}
        </p>
      </div>
      <Scale className="ml-auto h-4 w-4 shrink-0 text-steel-500" />
    </div>
  );
}
