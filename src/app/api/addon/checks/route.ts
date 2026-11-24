import { NextResponse } from "next/server";
import { appOriginAllowed, listAddonChecks } from "@/server/addon-pairing";
import { listBrowserChecks } from "@/server/browser-pairing";
import { applyBrowserCookie, browserIdFromRequest } from "@/server/browser-id";
import { OWNER_BROWSER_ID } from "@/server/user-scope";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!appOriginAllowed(origin)) {
    return NextResponse.json({ ok: false, checks: [] }, { status: 403 });
  }
  const identity = await browserIdFromRequest(request);
  const checks = process.env.PRIZE_SCOUT_STORE === "d1" && identity.id !== OWNER_BROWSER_ID
    ? await listBrowserChecks(identity.id)
    : await listAddonChecks();
  const response = NextResponse.json({ ok: true, checks });
  return applyBrowserCookie(response, identity.sealed, request);
}
