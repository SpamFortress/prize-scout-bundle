import { NextResponse } from "next/server";
import { SUBMITTER_MODULE_ENV } from "@/domain/submitter";
import { SEARCH_API_KEY_ENV, SEARCH_PROVIDER } from "@/server/giveaway-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const webSearchConnected = Boolean(process.env[SEARCH_API_KEY_ENV]?.trim());
  return NextResponse.json({
    ok: true,
    webSearchConnected,
    searchProvider: SEARCH_PROVIDER,
    searchKeyEnv: SEARCH_API_KEY_ENV,
    submitterConnected: false,
    submitterModuleEnv: SUBMITTER_MODULE_ENV,
    fortressConnected: false,
    inboxConnected: false,
    sponsorSubmission: false,
    captcha: false,
    winClassifier: false,
    message: webSearchConnected
      ? "Brave Search API key is set. A listing is added only after its official page is fetched. Nothing is invented."
      : "Web search is not connected. Set PRIZE_SCOUT_SEARCH_API_KEY to a Brave Search API subscription token. No listings are invented.",
  });
}
