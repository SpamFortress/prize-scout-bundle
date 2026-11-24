import { NextResponse } from "next/server";
import { acceptKofiWebhook } from "@/server/donation-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Ko-fi posts application/x-www-form-urlencoded with a `data` JSON field. The body is not logged. */
export async function POST(request: Request) {
  let data = "";
  const type = request.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) {
      const body = (await request.json()) as { data?: unknown };
      data = typeof body.data === "string" ? body.data : JSON.stringify(body);
    } else {
      const form = await request.formData();
      data = String(form.get("data") ?? "");
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!data) return NextResponse.json({ ok: false }, { status: 400 });
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const text = (key: string) => (typeof payload[key] === "string" || typeof payload[key] === "number" ? String(payload[key]) : "");
  const result = await acceptKofiWebhook({
    verificationToken: text("verification_token"),
    messageId: text("message_id"),
    amount: text("amount"),
    currency: text("currency"),
    email: text("email"),
    message: text("message"),
    type: text("type"),
  });
  return NextResponse.json({ ok: result.ok, duplicate: result.duplicate ?? false, matched: result.matched ?? false, ignored: result.ignored ?? false }, { status: result.status });
}
