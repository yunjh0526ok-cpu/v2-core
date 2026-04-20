import StoryAdminForm from "@/components/stories/StoryAdminForm";

export const metadata = {
  title: "Ethics-Drama 관리자 · 새 판례 등록",
};

export default function StoryAdminPage() {
  return (
    <div className="space-y-6">
      <div className="glass-strong rounded-3xl p-6 md:p-8">
        <p className="text-[11px] font-black uppercase tracking-widest text-orange-300">
          Ethics-Drama Admin · v2-core
        </p>
        <h2 className="mt-2 text-2xl font-black text-white md:text-3xl">
          강사 전용 · 판례 드라마 데이터베이스
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-steel-300">
          20년 현장에서 보신 판례를 ‘발단 · 갈등 · 파멸’ 3단 구조 + Dilemma
          Quiz + 징계수위 통계로 입력해 주세요. 저장과 동시에 /stories
          목록에 반영됩니다.
        </p>
      </div>
      <StoryAdminForm />
    </div>
  );
}
