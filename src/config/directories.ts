/**
 * Directories from the 2026-11-10 aggregator notes.
 * Expansion is off unless `expandAllowed` is true. None of these are allowed:
 * robots.txt or the terms of service do not clearly permit automated collection.
 * Sweepstakes Advantage forbids scraping. Contest Girl disallows /sweepstakes/.
 * I Love Giveaways blocks query-string URLs and sets a crawl-delay.
 * Brand hubs stay in the list so a Brave hit can be labeled, and they are not expanded.
 */
export interface DirectorySource {
  name: string;
  domain: string;
  /** When set, only this exact path is the listing index. */
  pathPrefixes?: readonly string[];
  /** False unless robots.txt and the terms of service both allow automated collection. */
  expandAllowed: boolean;
}

export const DIRECTORY_SOURCES: readonly DirectorySource[] = [
  { name: "Sweepstakes Advantage", domain: "sweepsadvantage.com", expandAllowed: false },
  { name: "SweepstakeBible", domain: "sweepstakesbible.com", expandAllowed: false },
  { name: "Sweepstakes Radar", domain: "sweepstakesradar.com", expandAllowed: false },
  { name: "WinThatWhip", domain: "winthatwhip.com", expandAllowed: false },
  { name: "FreebieMom", domain: "freebiemom.com", expandAllowed: false },
  { name: "Online Sweepstakes", domain: "online-sweepstakes.com", expandAllowed: false },
  { name: "I Love Giveaways", domain: "ilovegiveaways.com", expandAllowed: false },
  { name: "MorningSweeps", domain: "morningsweeps.com", expandAllowed: false },
  { name: "FreeEntry", domain: "freeentry.org", expandAllowed: false },
  { name: "Contest Girl", domain: "contestgirl.com", expandAllowed: false },
  { name: "Giveowl", domain: "giveowl.com", expandAllowed: false },
  { name: "Contest Bee", domain: "contestbee.com", expandAllowed: false },
  { name: "SweepsDB", domain: "sweepsdb.com", expandAllowed: false },
  { name: "Gun Giveaways", domain: "gungiveaways.net", expandAllowed: false },
  { name: "Sweepstakes Today", domain: "sweepstakestoday.com", expandAllowed: false },
  { name: "Wow Sweepstakes", domain: "wowsweepstakes.com", expandAllowed: false },
  { name: "HGTV", domain: "hgtv.com", pathPrefixes: ["/sweepstakes", "/giveaways"], expandAllowed: false },
  { name: "Discovery", domain: "discovery.com", pathPrefixes: ["/sweepstakes"], expandAllowed: false },
  { name: "TLC", domain: "tlc.com", pathPrefixes: ["/giveaways"], expandAllowed: false },
  { name: "Food Network", domain: "foodnetwork.com", pathPrefixes: ["/sweepstakes", "/giveaways"], expandAllowed: false },
  { name: "Gleam Giveaways", domain: "gleam.io", pathPrefixes: ["/giveaways"], expandAllowed: false },
];

export function hostName(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function directorySourceFor(url: string, sources: readonly DirectorySource[] = DIRECTORY_SOURCES): DirectorySource | null {
  const host = hostName(url);
  if (!host) return null;
  return sources.find((source) => hostMatches(host, source.domain)) ?? null;
}

/** True for a known directory URL. This does not mean the page may be fetched. */
export function isDirectoryListing(url: string, sources: readonly DirectorySource[] = DIRECTORY_SOURCES): boolean {
  const source = directorySourceFor(url, sources);
  if (!source) return false;
  if (!source.pathPrefixes || source.pathPrefixes.length === 0) return true;
  let path = "/";
  try {
    path = new URL(url).pathname.replace(/\/+$/, "").toLowerCase() || "/";
  } catch {
    return false;
  }
  return source.pathPrefixes.some((prefix) => path === prefix.replace(/\/+$/, "").toLowerCase());
}

/** Automated link collection is allowed only when the config says so. The default is no. */
export function directoryMayExpand(url: string, sources: readonly DirectorySource[] = DIRECTORY_SOURCES): boolean {
  const source = directorySourceFor(url, sources);
  return Boolean(source?.expandAllowed) && isDirectoryListing(url, sources);
}
