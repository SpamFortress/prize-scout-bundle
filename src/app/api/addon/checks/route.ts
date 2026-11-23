import { NextResponse } from "next/server";
import { appOriginAllowed, listAddonChecks } from "@/server/addon-pairing";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  if (!appOriginAllowed(origin)) {
    return NextResponse.json({ ok: false, checks: [] }, { status: 403 });
  }
  return NextResponse.json({ ok: true, checks: await listAddonChecks() });
}
