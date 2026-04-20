import DialogueRoom from "@/components/dialogue/DialogueRoom";
import WorkshopIntro from "@/components/dialogue/WorkshopIntro";
import Breadcrumbs from "@/components/nav/Breadcrumbs";

export default function DialoguePage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Dialogue" }]} />
      <WorkshopIntro />
      <div id="live" className="scroll-mt-24">
        <DialogueRoom />
      </div>
    </div>
  );
}
