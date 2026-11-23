import { NextResponse } from "next/server";
import { CAP_LINE, PAUSE_LINE, capDay, donationUrl } from "@/domain/usage";
import { braveCallBudget } from "@/domain/search-yield";
import { SEARCH_API_KEY_ENV, searchVerifiedGiveaways } from "@/server/giveaway-search";
import { lookupPublic } from "@/server/check-page";
import { addBraveRequests, beginSearch, dailyCap, maybeAlertLowCredit } from "@/server/usage-store";
import { applyBrowserCookie, browserIdFromRequest } from "@/server/browser-id";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { writeSearchCache } from "@/server/search-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function withBrowser(response: NextResponse, request: Request, sealed: string | null): NextResponse {
  return applyBrowserCookie(response, sealed, request) as NextResponse;
}

function pausePayload(reason: string | undefined): { pauseLine: string; donationUrl: string | null } {
  if (reason === "cap" || reason === "global") return { pauseLine: CAP_LINE, donationUrl: donationUrl() || null };
  return { pauseLine: PAUSE_LINE, donationUrl: null };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, paused: true, pauseLine: PAUSE_LINE, listings: [], submitted: false }, { status: 400 });
  }
  const query = body && typeof body === "object" && "query" in body ? String((body as { query?: unknown }).query ?? "") : "";
  const offsetRaw = body && typeof body === "object" && "offset" in body ? Number((body as { offset?: unknown }).offset) : 0;
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.min(200, Math.floor(offsetRaw)) : 0;
  if (!query.trim()) {
    return NextResponse.json({ ok: false, paused: false, listings: [], message: "A blank search is not sent.", submitted: false }, { status: 400 });
  }
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return withBrowser(NextResponse.json({ ok: false, paused: true, pauseLine: limited.message, listings: [], submitted: false }, { status: 429 }), request, identity.sealed);
  const hasKey = Boolean(process.env[SEARCH_API_KEY_ENV]?.trim()) || process.env.PRIZE_SCOUT_SEARCH_DRY_RUN === "1";
  try {
    const gate = await beginSearch({ anonId: identity.id, hasKey, query, offset });
    if (gate.cached) {
      return withBrowser(NextResponse.json({ ok: true, paused: false, cached: true, listings: gate.listings ?? [], nextOffset: gate.nextOffset ?? null, submitted: false }), request, identity.sealed);
    }
    if (gate.paused) {
      const pause = pausePayload(gate.reason);
      return withBrowser(NextResponse.json({ ok: true, paused: true, pauseLine: pause.pauseLine, donationUrl: pause.donationUrl, listings: [], submitted: false }), request, identity.sealed);
    }
    if (process.env.PRIZE_SCOUT_SEARCH_DRY_RUN === "1") {
      const listings = [{ url: `https://example.com/dry?q=${encodeURIComponent(query.trim().toLowerCase())}`, title: query.trim(), listingGroup: "check" }];
      await writeSearchCache(identity.id, capDay(new Date()), query, { listings, nextOffset: null }, offset);
      return withBrowser(NextResponse.json({ ok: true, paused: false, listings, submitted: false, dryRun: true, funded: gate.reason }), request, identity.sealed);
    }
    const wanted = braveCallBudget(query, offset);
    const extras = Math.min(Math.max(0, wanted - 1), Math.max(0, dailyCap() - gate.visitorSearches), gate.summary.searchesLeft ?? Math.max(0, wanted - 1));
    const result = await searchVerifiedGiveaways(query, {
      fetchImpl: fetch,
      lookupImpl: lookupPublic,
      now: () => new Date(),
      apiKey: process.env[SEARCH_API_KEY_ENV],
      searchUrl: process.env.PRIZE_SCOUT_SEARCH_URL,
      maxBraveCalls: 1 + extras,
      offset,
    });
    if (result.braveCalls > 1) await addBraveRequests(result.braveCalls - 1);
    const blocked = result.httpStatus === 401 || result.httpStatus === 402 || result.httpStatus === 403 || result.httpStatus === 429;
    if (!blocked) await writeSearchCache(identity.id, capDay(new Date()), query, { listings: result.listings, nextOffset: result.nextOffset }, offset);
    if (gate.summary.low) await maybeAlertLowCredit(gate.summary);
    return withBrowser(
      NextResponse.json({
        ok: true,
        paused: blocked,
        pauseLine: blocked ? PAUSE_LINE : undefined,
        listings: blocked ? [] : result.listings,
        nextOffset: blocked ? null : result.nextOffset,
        pagesNotOpened: result.pagesNotOpened,
        submitted: false,
        funded: gate.reason,
      }),
      request,
      identity.sealed,
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const code = error && typeof error === "object" && "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : null;
    console.error(JSON.stringify({ step: "search", name, code }));
    return withBrowser(
      NextResponse.json({ ok: false, error: "search_failed", paused: false, listings: [], submitted: false }, { status: 502 }),
      request,
      identity.sealed,
    );
  }
}
