import { NextResponse } from "next/server";
import { applyBrowserCookie, browserIdFromRequest } from "@/server/browser-id";
import { openDocumentStore, readFsDocument, writeFsDocument, dataDirectory } from "@/server/document-store";
import { userDocKey, type UserDocKind } from "@/server/user-scope";
import { clientIp, rateLimit } from "@/server/rate-limit";

const KINDS = ["saved", "entries", "profile"] as const;

async function readKind(userId: string, kind: UserDocKind): Promise<string | null> {
  const key = userDocKey(userId, kind);
  if (process.env.PRIZE_SCOUT_STORE === "d1") return (await openDocumentStore()).read(key);
  return readFsDocument(dataDirectory(), key);
}

async function writeKind(userId: string, kind: UserDocKind, value: string): Promise<void> {
  const key = userDocKey(userId, kind);
  if (process.env.PRIZE_SCOUT_STORE === "d1") {
    await (await openDocumentStore()).write(key, value);
    return;
  }
  writeFsDocument(dataDirectory(), key, value);
}

/** Saved searches, entries, and profile for the signed browser id. Nothing here is an account. */
export async function GET(request: Request) {
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429 });
  const [saved, entries, profile] = await Promise.all(KINDS.map((kind) => readKind(identity.id, kind)));
  const response = NextResponse.json({ ok: true, id: identity.id, saved, entries, profile });
  return applyBrowserCookie(response, identity.sealed, request);
}

export async function POST(request: Request) {
  const identity = await browserIdFromRequest(request);
  const limited = rateLimit({ id: identity.id, ip: clientIp(request) });
  if (!limited.ok) return NextResponse.json({ ok: false, message: limited.message }, { status: 429 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "The body was not JSON." }, { status: 400 });
  }
  const kind = body && typeof body === "object" && "kind" in body ? String((body as { kind?: unknown }).kind) : "";
  const value = body && typeof body === "object" && "value" in body ? (body as { value?: unknown }).value : null;
  if (!KINDS.includes(kind as (typeof KINDS)[number]) || typeof value !== "string") {
    return NextResponse.json({ ok: false, message: "Choose saved, entries, or profile." }, { status: 400 });
  }
  await writeKind(identity.id, kind as UserDocKind, value);
  const response = NextResponse.json({ ok: true, id: identity.id });
  return applyBrowserCookie(response, identity.sealed, request);
}
