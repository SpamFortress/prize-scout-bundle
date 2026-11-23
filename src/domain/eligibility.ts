import { daysUntil } from "./dates";
import type { Contest, EligibilityResult } from "./types";

export interface EligibilityProfile {
  country: string | null;
  state: string | null;
  age: number | null;
}

export function assessEligibility(
  contest: Pick<Contest, "limits" | "due">,
  profile: EligibilityProfile,
  now: Date,
): EligibilityResult {
  const reasons: string[] = [];
  let ineligible = false;
  let unknown = false;

  if (contest.due.proven && (daysUntil(contest.due, now) ?? 0) < 0) {
    ineligible = true;
    reasons.push("The stated end date has passed.");
  }

  const countries = contest.limits.countries;
  if (countries.length > 0 && !countries.includes("*")) {
    if (!profile.country) {
      unknown = true;
      reasons.push("The page states a country limit, and no country is entered in this tab.");
    } else if (!countries.includes(profile.country.toUpperCase())) {
      ineligible = true;
      reasons.push(`The page does not list ${profile.country.toUpperCase()} as eligible.`);
    } else {
      reasons.push(`Country ${profile.country.toUpperCase()} is listed on the page.`);
    }
  }

  const excluded = contest.limits.excludedStates ?? [];
  if (excluded.length > 0 && profile.state && excluded.includes(profile.state.toUpperCase())) {
    ineligible = true;
    reasons.push(`The page excludes ${profile.state.toUpperCase()}.`);
  }

  if (contest.limits.states.length > 0) {
    if (!profile.state) {
      unknown = true;
      reasons.push("The page states a state limit, and no state is entered in this tab.");
    } else if (!contest.limits.states.includes(profile.state.toUpperCase())) {
      ineligible = true;
      reasons.push(`The page does not list ${profile.state.toUpperCase()} as eligible.`);
    } else {
      reasons.push(`State ${profile.state.toUpperCase()} is listed on the page.`);
    }
  }

  const { minAge, maxAge } = contest.limits;
  if (minAge !== null || maxAge !== null) {
    if (profile.age === null) {
      unknown = true;
      reasons.push("The page states an age limit, and no age is entered in this tab.");
    } else if ((minAge !== null && profile.age < minAge) || (maxAge !== null && profile.age > maxAge)) {
      ineligible = true;
      reasons.push("The age entered in this tab is outside the limit stated on the page.");
    } else {
      reasons.push("The age entered in this tab is inside the limit stated on the page.");
    }
  }

  if (reasons.length === 0) {
    unknown = true;
    reasons.push("The page does not state a country, state, or age limit, so eligibility is not verified.");
  }

  if (ineligible) return { status: "ineligible", reasons };
  if (unknown) return { status: "unknown", reasons };
  return { status: "eligible", reasons };
}
