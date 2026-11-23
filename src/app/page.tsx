import { Suspense } from "react";
import { SearchHome } from "@/components/search-home";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-[#70757a]">Loading Prize Scout…</p>}>
      <SearchHome />
    </Suspense>
  );
}
