import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "lexguardai.vercel.app — AI 법률자문 플랫폼",
  description:
    "공직자·기관 전용 AI 법률자문 플랫폼. 국가법령 API + 판례 기반 리스크 진단 · Legal-Guide · Intelligence Hub · 청렴도 SaaS.",
  manifest: "/manifest.json",
  themeColor: "#0ea5e9",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LexGuard",
  },
  openGraph: {
    title: "lexguardai.vercel.app — AI 법률자문 플랫폼",
    description: "공직자·기관 전용 AI 법률자문 플랫폼",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
