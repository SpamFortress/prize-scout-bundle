import { NextResponse } from "next/server";
import { appOriginAllowed, getPairingToken, preparePairing } from "@/server/addon-pairing";
import { browserPairing } from "@/server/browser-pairing";
import { applyBrowserCookie, browserIdFromRequest } from "@/server/browser-id";
import { OWNER_BROWSER_ID } from "@/server/user-scope";

export const dynamic = "force-dynamic";

/** Shown on Profile. Website origins cannot read it. */
export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!appOriginAllowed(origin)) {
    return NextResponse.json({ ok: false, message: "This token is only shown by the practice app." }, { status: 403 });
  }
  const identity = await browserIdFromRequest(request);
  await preparePairing();
  const token = process.env.PRIZE_SCOUT_STORE === "d1" && identity.id !== OWNER_BROWSER_ID
    ? (await browserPairing(identity.id)).token
    : getPairingToken();
  const response = NextResponse.json({ ok: true, token });
  return applyBrowserCookie(response, identity.sealed, request);
}
