import { NextResponse } from "next/server";
import { addonPersistence, appOriginAllowed, preparePairing, rotatePairingToken } from "@/server/addon-pairing";
import { rotateBrowserPairing } from "@/server/browser-pairing";
import { OWNER_BROWSER_ID } from "@/server/user-scope";
import { applyBrowserCookie, browserIdFromRequest, requestIsLoopback } from "@/server/browser-id";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { ownerRequestAllowed, ownerTokenExpected } from "@/server/owner-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function ownerToken(request: Request): string {
  return request.headers.get("x-owner-token") ?? "";
}

/** Replaces the add-on pairing token for this browser. The previous token for that browser stops working. */
export async function POST(request: Request) {
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429 });
  const expected = await ownerTokenExpected();
  if (!appOriginAllowed(request.headers.get("origin")) || !ownerRequestAllowed({
    loopback: requestIsLoopback(request),
    token: ownerToken(request),
    browserId: identity.id,
    expectedToken: expected,
  })) {
    return NextResponse.json({ ok: false, message: "Owner access is required." }, { status: 403 });
  }
  await preparePairing();
  const token = process.env.PRIZE_SCOUT_STORE === "d1" && identity.id !== OWNER_BROWSER_ID
    ? await rotateBrowserPairing(identity.id)
    : rotatePairingToken();
  await addonPersistence();
  const response = NextResponse.json({ ok: true, token });
  return applyBrowserCookie(response, identity.sealed, request) as NextResponse;
}
