import { NextResponse } from "next/server";
import { PAUSE_LINE } from "@/domain/usage";
import { braveCallBudget } from "@/domain/search-yield";
import { SEARCH_API_KEY_ENV, searchVerifiedGiveaways } from "@/server/giveaway-search";
import { lookupPublic } from "@/server/check-page";
import { addBraveRequests, anonIdFromCookie, beginSearch, dailyCap, maybeAlertLowCredit } from "@/server/usage-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function withAnon(response: NextResponse, id: string, fresh: boolean): NextResponse {
  if (fresh) {
    response.cookies.set("ps_anon", id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 400 });
  }
  return response;
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
  const anon = anonIdFromCookie(request.headers.get("cookie"));
  const hasKey = Boolean(process.env[SEARCH_API_KEY_ENV]?.trim());
  try {
    const gate = await beginSearch({ anonId: anon.id, hasKey });
    if (gate.paused) {
      return withAnon(NextResponse.json({ ok: true, paused: true, pauseLine: PAUSE_LINE, listings: [], submitted: false }), anon.id, anon.fresh);
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
    if (gate.summary.low) await maybeAlertLowCredit(gate.summary);
    return withAnon(
      NextResponse.json({
        ok: true,
        paused: blocked,
        pauseLine: blocked ? PAUSE_LINE : undefined,
        listings: blocked ? [] : result.listings,
        nextOffset: blocked ? null : result.nextOffset,
        pagesNotOpened: result.pagesNotOpened,
        submitted: false,
      }),
      anon.id,
      anon.fresh,
    );
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const code = error && typeof error === "object" && "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : null;
    console.error(JSON.stringify({ step: "search", name, code }));
    return withAnon(
      NextResponse.json({ ok: false, error: "search_failed", paused: false, listings: [], submitted: false }, { status: 502 }),
      anon.id,
      anon.fresh,
    );
  }
}
