import { NextResponse } from "next/server";
import { appOriginAllowed, getPairingToken } from "@/server/addon-pairing";

export const dynamic = "force-dynamic";

/** Shown on Profile. Website origins cannot read it. */
export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!appOriginAllowed(origin)) {
    return NextResponse.json({ ok: false, message: "This token is only shown by the practice app." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, token: getPairingToken() });
}
