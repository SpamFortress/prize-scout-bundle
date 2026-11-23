"use client";

import { useRouter } from "next/navigation";
import { ProfilePreview } from "@/app/design-preview/profile-preview";
import { AddonPairingToken } from "@/components/addon-pairing-token";

export default function PracticeProfilePage() {
  const router = useRouter();
  return (
    <main className="mx-auto max-w-3xl px-4 pt-20 pb-16">
      <AddonPairingToken />
      <ProfilePreview onBack={() => router.push("/practice")} />
    </main>
  );
}
