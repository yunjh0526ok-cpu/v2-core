import Link from "next/link";
import {
  BookOpen,
  BarChart3,
  ClipboardCheck,
  Scale,
  ShieldCheck,
  LogOut,
  Sparkles,
} from "lucide-react";
import LogoutButton from "./LogoutButton";
import { prisma } from "@/lib/prisma";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const [consultations, applications, stories, dialogue] = await Promise.all([
    prisma.consultation.count(),
    prisma.application.count(),
    prisma.story.count(),
    prisma.dialogueFeedback.count(),
  ]);

  const cards = [
    {
      href: "/stories/admin",
      icon: BookOpen,
      title: "Ethics-Drama 관리",
      desc: "판례 스토리 카드뉴스 생성/편집",
      count: stories,
      countLabel: "스토리",
    },
    {
      href: "/intelligence-hub",
      icon: BarChart3,
      title: "Intelligence Hub",
      desc: "실시간 청렴도 진단 대시보드",
      count: consultations,
      countLabel: "상담",
    },
    {
      href: "/legal-guide",
      icon: Scale,
      title: "Legal-Guide 테스트",
      desc: "Gemini + 법령 API 챗봇 검증",
      count: consultations,
      countLabel: "누적",
    },
    {
      href: "/dialogue",
      icon: Sparkles,
      title: "Dialogue 세션",
      desc: "현장 토론 · 실시간 투표 관리",
      count: dialogue,
      countLabel: "피드백",
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Admin Console" }]} />
      <header className="gradient-border flex items-center justify-between gap-4 rounded-3xl border border-sky-300/25 bg-gradient-to-br from-navy-800/80 via-navy-900/80 to-violet-950/40 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-navy-700 to-orange-550 orange-glow">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-orange-300">Admin Console</p>
            <h1 className="text-xl font-black text-white">Ethics-Core AI 2.0</h1>
            <p className="text-xs text-steel-300">
              세션 인증됨 · 8시간 후 자동 만료
            </p>
          </div>
        </div>
        <LogoutButton />
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Legal-Guide 상담" value={consultations} />
        <StatCard label="/apply 신청" value={applications} />
        <StatCard label="Drama 스토리" value={stories} />
        <StatCard label="Dialogue 피드백" value={dialogue} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href}
              href={c.href}
              className="group glass rounded-2xl p-5 transition hover:border-orange-400/40"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900/80 text-orange-400 group-hover:bg-gradient-to-br group-hover:from-navy-700 group-hover:to-orange-550 group-hover:text-white">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{c.title}</p>
                    <p className="text-[11px] text-steel-400">{c.desc}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-orange-300">{c.count}</p>
                  <p className="text-[10px] text-steel-400">{c.countLabel}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </section>

      <section className="glass rounded-3xl p-6 text-xs text-steel-300">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-black text-white">
          <ClipboardCheck className="h-4 w-4 text-orange-400" />
          보안 정책
        </h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            비밀번호는 <code className="font-mono text-orange-300">ADMIN_PASSWORD</code>{" "}
            환경변수로만 관리됩니다. 코드/Git 에 노출되지 않습니다.
          </li>
          <li>
            로그인 성공 시 HMAC-SHA256 서명된 세션 쿠키(HttpOnly·Lax·8h)를 발급합니다.
          </li>
          <li>
            동일 IP 에서 10분 내 10회 실패 시 자동으로 일시 차단됩니다.
          </li>
          <li>
            관리자 경로: <code className="font-mono">/admin</code>,{" "}
            <code className="font-mono">/stories/admin</code>,{" "}
            <code className="font-mono">/api/admin/*</code>, 그리고{" "}
            <code className="font-mono">POST /api/stories</code>.
          </li>
        </ul>
      </section>

      <p className="flex items-center justify-center gap-1 text-[11px] text-steel-500">
        <LogOut className="h-3 w-3" />
        로그아웃은 우측 상단 버튼을 이용하세요.
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5">
      <p className="text-[11px] text-steel-300">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
    </div>
  );
}
