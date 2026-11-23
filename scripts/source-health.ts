/**
 * Owner-side source health report.
 * Default: print a fixture report. Does not call Brave and does not open giveaway pages.
 * Live checks stay off unless SOURCE_HEALTH_LIVE=1 is set by the owner on their own machine.
 */
import { probeSource, renderHealthReport, type HealthFetch, type HealthTarget } from "@/domain/source-health";

const FIXTURES: HealthTarget[] = [
  { name: "Missing shop", url: "https://watched.example/giveaway", kind: "watched" },
  { name: "Moved shop", url: "https://moved.example/sweepstakes", kind: "watched" },
  { name: "Directory", url: "https://directory.example/sweepstakes", kind: "aggregator" },
  { name: "Walled host", url: "https://walled.example/enter", kind: "watched" },
];

const FIXTURE_FETCH: HealthFetch = async (url) => {
  if (url.endsWith("/robots.txt") && url.includes("directory.example")) {
    return { status: 200, location: null, body: "User-agent: *\nDisallow: /sweepstakes\n" };
  }
  if (url.endsWith("/robots.txt")) return { status: 200, location: null, body: "User-agent: *\nAllow: /\n" };
  if (url.includes("watched.example")) return { status: 404, location: null, body: "missing" };
  if (url.includes("moved.example")) return { status: 301, location: "https://moved.example/new", body: "" };
  if (url.includes("walled.example")) return { status: 200, location: null, body: '<div class="cf-turnstile"></div>' };
  return { status: 200, location: null, body: "<p>Directory</p>" };
};

async function main() {
  if (process.env.SOURCE_HEALTH_LIVE === "1") {
    console.error("Live source checks are not run from the practice build. Unset SOURCE_HEALTH_LIVE.");
    process.exit(1);
  }
  const findings = [];
  for (const target of FIXTURES) findings.push(await probeSource(target, FIXTURE_FETCH));
  console.log(renderHealthReport(findings, 0.25));
}

main();
