"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import MobileNav from "./MobileNav";
import MobileDrawer from "./MobileDrawer";
import DailyQuoteBanner from "./eco/DailyQuoteBanner";
import EchoFloatingChat from "./eco/EchoFloatingChat";
import UniversalInstallWidget from "./eco/UniversalInstallWidget";
import WelcomeOnboarding from "./WelcomeOnboarding";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen">
      {/* Moving Tech Grid — 전체 배경 (은은하게) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="tech-grid-glow" />
        <div className="tech-grid-bg" />
      </div>
      <Sidebar />
      <div className="relative flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 px-4 pb-32 pt-5 md:p-8 md:pb-16">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
        <footer className="hidden space-y-1 px-8 py-4 text-[11px] text-steel-400/80 md:block">
          <p>Ethics-Core AI 2.0 · v2-core platform · © Ethics-Core AI Center</p>
          <p className="text-[10.5px] text-steel-400/70">
            법적 효력 없음 · 본 웹 서비스의 자동 생성 결과는 참고용이며 최종 법적 판단/제출 책임은 사용자에게 있습니다.
          </p>
        </footer>
      </div>
      <MobileNav />
      <MobileDrawer />
      <DailyQuoteBanner />
      <EchoFloatingChat />
      <UniversalInstallWidget />
      <WelcomeOnboarding />
    </div>
  );
}
