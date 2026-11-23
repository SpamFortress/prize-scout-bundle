/**
 * Owner-side source check. It records status codes, redirects, robots notes, and bot-wall text.
 * It does not solve a challenge, follow a redirect into a blocked host, or use a search key.
 */

export interface HealthTarget {
  name: string;
  url: string;
  kind: "watched" | "aggregator";
}

export interface HealthFinding {
  name: string;
  url: string;
  kind: HealthTarget["kind"];
  status: number | null;
  redirectedTo: string | null;
  robotsNote: string | null;
  botWall: string | null;
  error: string | null;
}

export interface HealthFetch {
  (url: string): Promise<{ status: number; body: string; location: string | null }>;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function botWall(body: string): string | null {
  if (/cf-turnstile|challenges\.cloudflare\.com\/turnstile/i.test(body)) return "Cloudflare Turnstile";
  if (/google\.com\/recaptcha|g-recaptcha|recaptcha\/api/i.test(body)) return "reCAPTCHA";
  return null;
}

function robotsNote(policy: string, pageUrl: string): string | null {
  let path = "/";
  try {
    path = new URL(pageUrl).pathname || "/";
  } catch {
    return null;
  }
  if (!policy.trim()) return "robots.txt was empty";
  const blocks = policy.split(/(?=User-agent\s*:)/i).filter((block) => /user-agent\s*:\s*\*/i.test(block));
  const rules = blocks.length > 0 ? blocks : [policy];
  const disallows = rules.join("\n").split("\n").map((line) => line.trim()).filter((line) => /^disallow\s*:/i.test(line));
  const hit = disallows.find((line) => {
    const rule = line.split(":").slice(1).join(":").trim();
    if (!rule) return false;
    return path === rule || path.startsWith(rule.endsWith("/") ? rule : `${rule}`);
  });
  return hit ? `robots.txt ${hit.trim()}` : null;
}

/** One target. Redirects are recorded and not followed. */
export async function probeSource(target: HealthTarget, fetchImpl: HealthFetch): Promise<HealthFinding> {
  const finding: HealthFinding = {
    name: target.name,
    url: target.url,
    kind: target.kind,
    status: null,
    redirectedTo: null,
    robotsNote: null,
    botWall: null,
    error: null,
  };
  try {
    const page = await fetchImpl(target.url);
    finding.status = page.status;
    if (page.status >= 300 && page.status < 400) finding.redirectedTo = page.location;
    if (page.status === 200) finding.botWall = botWall(page.body);
  } catch {
    finding.error = "The check did not complete.";
  }
  try {
    const robotsUrl = `https://${hostOf(target.url)}/robots.txt`;
    const robots = await fetchImpl(robotsUrl);
    if (robots.status === 200) finding.robotsNote = robotsNote(robots.body, target.url);
    else if (robots.status === 404) finding.robotsNote = "robots.txt returned 404";
  } catch {
    finding.robotsNote = "robots.txt could not be read";
  }
  return finding;
}

export function renderHealthReport(findings: readonly HealthFinding[], unreadRate: number | null): string {
  const lines = ["# Source health", "", "Offline check. Challenges were not solved and redirects were not followed.", ""];
  const broken = findings.filter((item) => item.status === 404 || item.status === 410 || item.error);
  const redirects = findings.filter((item) => item.redirectedTo);
  const walls = findings.filter((item) => item.botWall);
  const robots = findings.filter((item) => item.robotsNote);
  lines.push("## Broken sources");
  lines.push(broken.length === 0 ? "None in this check." : broken.map((item) => `- ${item.name} (${item.url}) — ${item.error ?? `HTTP ${item.status}`}`).join("\n"));
  lines.push("", "## Redirects");
  lines.push(redirects.length === 0 ? "None in this check." : redirects.map((item) => `- ${item.name} — ${item.status} to ${item.redirectedTo}`).join("\n"));
  lines.push("", "## robots.txt");
  lines.push(robots.length === 0 ? "No disallow or missing robots.txt in this check." : robots.map((item) => `- ${item.name} — ${item.robotsNote}`).join("\n"));
  lines.push("", "## Bot walls");
  lines.push(walls.length === 0 ? "No Turnstile or reCAPTCHA marker in this check." : walls.map((item) => `- ${item.name} — ${item.botWall}. Stop and show the official page.`).join("\n"));
  lines.push("", "## Can't read this site");
  lines.push(unreadRate === null ? "No unread rate was supplied." : `${Math.round(unreadRate * 100)}% of checked directory rows were unread.`);
  lines.push("", "## Recommendation");
  lines.push(walls.length > 0 || broken.length > 0 ? "Watch. Do not bypass a wall or a disallow." : "No change from this fixture check.");
  return lines.join("\n");
}
