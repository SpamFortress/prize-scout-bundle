import { prize1099Line } from "@/config/prize-reporting";
import { FEDERAL_2026, FEDERAL_TAX_CITATION, FEDERAL_TAX_YEAR, federalIncomeTaxCents, formatUsdFromCents } from "./federal-tax";
import { STATE_TAX_SLOTS } from "./us-states";

export interface EntryTaxLine {
  /** One short figure for the row. Empty when there is no ARV. */
  short: string;
  primary: string;
  detail: string;
  /** 1099 reporting threshold. Not part of the tax estimate. */
  reporting: string;
}

function slotFor(choice: string | null): (typeof STATE_TAX_SLOTS)[number] | null {
  if (!choice || choice === "sample") return null;
  const needle = choice.trim().toLowerCase();
  return STATE_TAX_SLOTS.find((slot) => slot.code.toLowerCase() === needle || slot.name.toLowerCase() === needle) ?? null;
}

function statePhrase(choice: string | null, arvUsd: number | null): string {
  const slot = slotFor(choice);
  if (!slot) return "State not estimated.";
  const sourced = slot.officialRate !== null && typeof slot.source === "string" && slot.source.trim().length > 0;
  if (!sourced || slot.officialRate === null || arvUsd === null) return `${slot.name}: state not estimated.`;
  const cents = Math.round(arvUsd * slot.officialRate * 100);
  return `${slot.name} estimate ${formatUsdFromCents(cents)} (${slot.source}).`;
}

/**
 * Federal tax on a stated ARV using the 2026 single table.
 * The standard deduction is not subtracted: other income is not an input on this screen.
 * State tax is shown only when that state's slot has a rate and a citation.
 */
export function entryTaxLine(input: { arvUsd: number | null; arvKind: "sample" | "verified" | "unstated"; stateChoice: string | null; prizeYear?: number | null }): EntryTaxLine {
  const state = statePhrase(input.stateChoice, input.arvUsd);
  const reporting = prize1099Line(input.prizeYear ?? null);
  if (input.arvUsd === null || input.arvKind === "unstated") {
    return {
      short: "",
      primary: `Prize ARV not stated. Federal tax not estimated. ${state}`,
      detail: `Federal brackets for ${FEDERAL_TAX_YEAR} are loaded from ${FEDERAL_TAX_CITATION}. They are not applied without a stated ARV. This is not a bill. ${reporting}`,
      reporting,
    };
  }
  const cents = federalIncomeTaxCents(input.arvUsd, "single");
  if (cents === null) {
    return {
      short: "",
      primary: `Federal tax not estimated. ${state}`,
      detail: `The ARV could not be read as a dollar amount. No rate was invented. ${reporting}`,
      reporting,
    };
  }
  const kind = input.arvKind === "sample" ? "sample ARV" : "ARV stated on the fetched page";
  const single = FEDERAL_2026.single;
  const amount = formatUsdFromCents(cents);
  return {
    short: `Est. federal tax ${amount}`,
    primary: `Federal ${amount} on ${kind} ${formatUsdFromCents(Math.round(input.arvUsd * 100))} (${FEDERAL_TAX_YEAR} single, Rev. Proc. 2025-32). Not a bill. ${state}`,
    detail: `If that ARV were taxable income, filing ${single.label.toLowerCase()}, ${single.section}. The ${FEDERAL_TAX_YEAR} single standard deduction (${formatUsdFromCents(single.standardDeduction * 100)}, Rev. Proc. 2025-32) is not subtracted, because other income is not entered. ${FEDERAL_TAX_CITATION}. This is not a bill. ${reporting}`,
    reporting,
  };
}
