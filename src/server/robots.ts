interface Rule {
  allow: boolean;
  path: string;
}

export function robotsAllows(body: string, path: string, agent = "prizescout"): { allowed: boolean; reason: string } {
  if (!body.trim() || /^\s*</.test(body)) {
    return { allowed: false, reason: "robots.txt was not a plain-text policy, so the page was not fetched." };
  }
  const groups: Array<{ agents: string[]; rules: Rule[] }> = [];
  let current: { agents: string[]; rules: Rule[] } | null = null;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const splitAt = line.indexOf(":");
    if (splitAt === -1) continue;
    const field = line.slice(0, splitAt).trim().toLowerCase();
    const value = line.slice(splitAt + 1).trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.rules.push({ allow: field === "allow", path: value });
    }
  }
  const specific = groups.find((group) => group.agents.includes(agent.toLowerCase()) && group.rules.length > 0);
  const wildcard = groups.find((group) => group.agents.includes("*"));
  const rules = specific?.rules ?? wildcard?.rules ?? [];
  const target = path.startsWith("/") ? path : `/${path}`;
  let winner: { allow: boolean; length: number } | null = null;
  for (const rule of rules) {
    if (!rule.path) continue;
    const longer = !winner || rule.path.length > winner.length;
    const tieAllow = Boolean(winner && rule.path.length === winner.length && rule.allow);
    if (target.startsWith(rule.path) && (longer || tieAllow)) {
      winner = { allow: rule.allow, length: rule.path.length };
    }
  }
  if (!winner || winner.allow) return { allowed: true, reason: "robots.txt does not disallow this path." };
  return { allowed: false, reason: "robots.txt disallows this path. Prize Scout did not fetch it." };
}
