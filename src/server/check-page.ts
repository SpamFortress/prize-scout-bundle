import { uniqueId } from "@/domain/ids";
import { observeHtml } from "@/domain/interpret";
import type { Contest, RuleProof } from "@/domain/types";
import { robotsAllows } from "./robots";
import { hostIsBlocked, ipIsBlocked, isIpAddress } from "./ssrf";

export interface CheckDeps {
  fetchImpl: typeof fetch;
  lookupImpl: (hostname: string) => Promise<string[]>;
  now: () => Date;
}

export type CheckOutcome =
  | { ok: true; status: number; contest: Contest; proof: RuleProof; message: string; html: string }
  | { ok: false; status: number; message: string };

const DOH_URL = "https://cloudflare-dns.com/dns-query";

async function resolveType(hostname: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = new URL(DOH_URL);
  url.searchParams.set("name", hostname);
  url.searchParams.set("type", type);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(5_000),
    headers: { accept: "application/dns-json" },
  });
  if (response.status >= 300 && response.status < 400) throw new Error("DNS lookup redirected.");
  if (!response.ok) throw new Error("DNS lookup failed.");
  const body = (await response.json()) as { Status?: number; Answer?: Array<{ type?: number; data?: string }> };
  if (body.Status !== 0) return [];
  const want = type === "A" ? 1 : 28;
  return (body.Answer ?? []).flatMap((answer) => (answer.type === want && typeof answer.data === "string" ? [answer.data] : []));
}

/** Resolves a hostname to addresses. An IP is returned as itself. Private ranges are checked by the caller. */
export async function lookupPublic(hostname: string): Promise<string[]> {
  if (isIpAddress(hostname)) return [hostname];
  const [v4, v6] = await Promise.all([resolveType(hostname, "A"), resolveType(hostname, "AAAA")]);
  const addresses = [...v4, ...v6];
  if (addresses.length === 0) throw new Error("DNS lookup returned no addresses.");
  return addresses;
}

/** Reads at most `max` bytes and returns that text. A longer body is cut, not thrown. */
async function readLimited(response: Response, max: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const room = max - total;
      if (value.byteLength > room) {
        chunks.push(value.subarray(0, room));
        total += room;
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* The body is already finished. */
    }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buf.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buf);
}

function logCheckFailure(step: string, error: unknown): void {
  const name = error instanceof Error ? error.name : "Error";
  const code = error && typeof error === "object" && "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? error.code : null;
  console.error(JSON.stringify({ step, name, code }));
}

function fail(status: number, message: string): { ok: false; status: number; message: string } {
  return { ok: false, status, message };
}

export type PublicHtml =
  | { ok: true; status: number; html: string; url: string }
  | { ok: false; status: number; message: string };

/** Fetches one public HTML page after robots.txt allows that path. Redirects are not followed. */
export async function fetchPublicHtml(rawUrl: string, deps: CheckDeps, timeoutMs = 10_000): Promise<PublicHtml> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return fail(400, "Enter the https address of an official entry or rules page.");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return fail(400, "Only public https addresses can be checked.");
  }
  if (hostIsBlocked(url.hostname)) return fail(400, "That host is not public. The page was not fetched.");

  let ips: string[] = [];
  try {
    ips = await deps.lookupImpl(url.hostname);
  } catch {
    return fail(400, "The host name did not resolve. The page was not fetched.");
  }
  if (ips.length === 0 || ips.some((ip) => ipIsBlocked(ip))) {
    return fail(400, "That host resolves to a private network. The page was not fetched.");
  }

  const headers = { "user-agent": "PrizeScout/0.1", accept: "text/html, text/plain" };
  let robots: Response;
  try {
    robots = await deps.fetchImpl(new URL("/robots.txt", url.origin).toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(Math.min(8000, timeoutMs)),
      headers,
    });
  } catch {
    return fail(502, "robots.txt could not be read, so the page was not fetched.");
  }
  if (robots.status >= 300 && robots.status < 400) {
    return fail(502, "robots.txt redirects. Prize Scout did not follow it, so the page was not fetched.");
  }
  if (robots.status !== 404) {
    if (!robots.ok) return fail(502, `robots.txt returned HTTP ${robots.status}, so the page was not fetched.`);
    let policy = "";
    try {
      policy = await readLimited(robots, 200_000);
    } catch (error) {
      logCheckFailure("robots_read", error);
      return fail(502, "robots.txt could not be read, so the page was not fetched.");
    }
    const decision = robotsAllows(policy, url.pathname || "/");
    if (!decision.allowed) return fail(403, decision.reason);
  }

  let response: Response;
  try {
    response = await deps.fetchImpl(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
  } catch {
    return fail(502, "The page did not load. No contest was added.");
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    return fail(
      409,
      location
        ? `The page redirects to ${location}. Prize Scout did not follow it. Check that address if it is the official page.`
        : "The page redirects. Prize Scout did not follow it.",
    );
  }
  if (!response.ok) return fail(502, `The page returned HTTP ${response.status}. No contest was added.`);
  const type = response.headers.get("content-type") ?? "";
  const pdf = /pdf/i.test(type) || url.pathname.toLowerCase().endsWith(".pdf");
  const plain = /text\/plain/i.test(type);
  if (!/html/i.test(type) && !pdf && !plain) return fail(415, "That URL did not return an HTML page, so no contest was recorded.");

  let html = "";
  try {
    html = await readLimited(response, 1_000_000);
  } catch (error) {
    logCheckFailure("official_page_read", error);
    return fail(502, "The page could not be read. No contest was added.");
  }
  if (!/html/i.test(type)) html = htmlFromDocument(html, pdf);
  return { ok: true, status: response.status, html, url: url.toString() };
}

function htmlFromDocument(body: string, pdf: boolean): string {
  const runs = (body.match(/[\t\n\r\x20-\x7E]{12,}/g) ?? []).join(" ");
  const literals = pdf ? [...body.matchAll(/\((?:\\\)|[^)]){8,}\)/g)].map((match) => match[0].slice(1, -1)).join(" ") : "";
  const text = (runs.length >= 40 ? runs : literals || runs).replace(/[<>]/g, " ");
  return `<!doctype html><html><head><title>Official rules</title></head><body><p>${text}</p></body></html>`;
}

export async function checkOfficialPage(rawUrl: string, deps: CheckDeps, timeoutMs = 10_000): Promise<CheckOutcome> {
  const fetched = await fetchPublicHtml(rawUrl, deps, timeoutMs);
  if (!fetched.ok) return fetched;
  const now = deps.now();
  const observed = observeHtml(fetched.html, fetched.url, now);
  if (!observed.ok) return fail(422, observed.error);

  const contest = observed.contest;
  const ready = contest.readiness === "form_checked";
  const proof: RuleProof = {
    id: uniqueId("proof"),
    contestId: contest.id,
    checkedAt: now.toISOString(),
    officialUrl: fetched.url,
    httpStatus: fetched.status,
    rulesLinkFound: Boolean(contest.rulesUrl),
    formFound: contest.formChecked,
    hubOnly: contest.hubOnly,
    ready,
    notes: [
      ...observed.warnings,
      contest.hubOnly
        ? "This is a directory or social page, not an official entry form."
        : ready
          ? "A form and a rules link were observed on this page. Nothing was submitted."
          : "The page was fetched. A form and a rules link were not both observed, so it is not ready to enter.",
    ],
  };
  const message = ready
    ? "Fetched the page. A form and official rules were observed. Nothing was submitted."
    : contest.hubOnly
      ? "Fetched the page. It is a directory or social listing, not an official entry form, so it cannot be saved."
      : "Fetched the page. It is not ready to enter because a form and rules link were not both observed. Nothing was submitted.";
  return { ok: true, status: 200, contest, proof, message, html: fetched.html };
}
