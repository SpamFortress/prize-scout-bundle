import React from "react";
import { meterLine } from "@/domain/donations";

export function DonationMeter({
  coveredUsd,
  budgetUsd,
  bonus,
  claimCode,
  donationUrl,
}: {
  coveredUsd: number;
  budgetUsd: number;
  bonus: number;
  claimCode?: string;
  donationUrl?: string | null;
}) {
  return (
    <section data-donation-meter="yes" className="mt-6 space-y-2 text-sm text-[#3c4043]">
      <p>{meterLine(coveredUsd, budgetUsd)}</p>
      <p data-bonus-balance="yes">Your bonus searches: {bonus}</p>
      {claimCode ? <p data-claim-code="yes">Ko-fi message code: {claimCode}</p> : null}
      {donationUrl ? (
        <a href={donationUrl} className="text-[#1a0dab] hover:underline" data-donation-link="yes">
          Donate
        </a>
      ) : null}
    </section>
  );
}
