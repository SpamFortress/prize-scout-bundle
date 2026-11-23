import { NextResponse } from "next/server";
import { appOriginAllowed, rotatePairingToken } from "@/server/addon-pairing";
import { ownerTokenMatches } from "@/server/owner-gate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function loopbackHost(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname.replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function ownerToken(request: Request): string {
  return request.headers.get("x-owner-token") ?? "";
}

/** Replaces the add-on pairing token. The previous token stops working immediately. */
export async function POST(request: Request) {
  if (!loopbackHost(request) || !appOriginAllowed(request.headers.get("origin")) || !ownerTokenMatches(ownerToken(request))) {
    return NextResponse.json({ ok: false, message: "Owner access is required." }, { status: 403 });
  }
  const token = rotatePairingToken();
  return NextResponse.json({ ok: true, token });
}
