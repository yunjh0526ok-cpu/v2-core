import HubDashboard from "@/components/hub/HubDashboard";
import PremiumGate from "@/components/hub/PremiumGate";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

export const metadata = {
  title: "Intelligence Hub · Ethics-Core AI 2.0",
  description: "기관용 청렴 진단 데이터 시각화 및 자동 리포트 생성 센터.",
};

export default function IntelligenceHubPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Intelligence Hub" }]} />
      <PremiumGate>
        <HubDashboard />
      </PremiumGate>
    </div>
  );
}
