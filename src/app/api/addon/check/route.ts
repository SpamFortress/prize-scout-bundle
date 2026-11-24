import { NextResponse } from "next/server";
import { classifyRenderedPage, storeRenderedCheck, withAddonVersion } from "@/server/addon-check";
import { PAIRING_EXPIRED_MESSAGE, addonCorsHeaders, addonPersistence, authorizeAddonPost, preparePairing } from "@/server/addon-pairing";
import { authorizeBrowserToken, saveBrowserCheck } from "@/server/browser-pairing";
import { clientIp, rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: addonCorsHeaders(origin) });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const headers = addonCorsHeaders(origin);
  await preparePairing();
  const auth = authorizeAddonPost(request);
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const browser = auth.ok || auth.status === 403 ? null : await authorizeBrowserToken(bearer);
  if (browser && !browser.ok && browser.message === PAIRING_EXPIRED_MESSAGE) {
    return NextResponse.json({ ok: false, message: browser.message }, { status: 401, headers });
  }
  if (!auth.ok && (!browser || !browser.ok)) {
    const limited = rateLimit({ id: bearer || "anon", ip: clientIp(request) });
    if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429, headers });
    return NextResponse.json({ ok: false, message: browser && !browser.ok ? browser.message : auth.message }, { status: auth.status, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The check body was not JSON." }, { status: 400, headers });
  }
  const record = body && typeof body === "object" ? (body as { url?: unknown; html?: unknown; limits?: unknown; addonVersion?: unknown }) : {};
  const url = typeof record.url === "string" ? record.url : "";
  const html = typeof record.html === "string" ? record.html : "";
  const addonVersion = typeof record.addonVersion === "string" ? record.addonVersion : "";
  const limits = Array.isArray(record.limits) ? record.limits.filter((item): item is string => typeof item === "string") : [];
  if (!url.startsWith("https://") || html.length === 0) {
    return NextResponse.json({ ok: false, message: "A https tab snapshot is required." }, { status: 400, headers });
  }
  const snapshot = html.slice(0, 1_500_000);
  const result = withAddonVersion(classifyRenderedPage(snapshot, url, new Date(), limits), addonVersion);
  if (browser && browser.ok) {
    await saveBrowserCheck(browser.userId, { ...result, checkedAt: new Date().toISOString(), html: snapshot });
  } else {
    storeRenderedCheck(result, new Date().toISOString(), snapshot);
    await addonPersistence();
  }
  return NextResponse.json({ ok: true, ...result }, { headers });
}
