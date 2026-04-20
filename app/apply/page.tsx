import ApplyWizard from "@/components/apply/ApplyWizard";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

export default function ApplyPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Apply · 맞춤 커리큘럼 신청" }]} />
      <ApplyWizard />
    </div>
  );
}
