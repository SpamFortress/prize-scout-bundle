/**
 * Public-address checks without node:dns or node:net.
 * The ranges match the previous BlockList, and a value that is not an IP stays blocked.
 */

function parseIpv4(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let address = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith("0"))) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    address = ((address << 8) | octet) >>> 0;
  }
  return address;
}

function parseIpv6(value: string): number[] | null {
  const lower = value.toLowerCase();
  if (lower.includes("%") || lower.includes(":::")) return null;
  const halves = lower.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string): string[] | null => {
    if (side === "") return [];
    const bits = side.split(":");
    const groups: string[] = [];
    for (let index = 0; index < bits.length; index += 1) {
      const bit = bits[index] ?? "";
      if (bit.includes(".")) {
        if (index !== bits.length - 1) return null;
        const v4 = parseIpv4(bit);
        if (v4 === null) return null;
        groups.push(((v4 >>> 16) & 0xffff).toString(16), (v4 & 0xffff).toString(16));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(bit)) return null;
      groups.push(bit);
    }
    return groups;
  };
  const head = parseSide(halves[0] ?? "");
  if (!head) return null;
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    return head.map((group) => Number.parseInt(group, 16));
  }
  const tail = parseSide(halves[1] ?? "");
  if (!tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  const toNumber = (group: string) => Number.parseInt(group, 16);
  return [...head.map(toNumber), ...Array<number>(missing).fill(0), ...tail.map(toNumber)];
}

export function isIpAddress(value: string): boolean {
  return parseIpv4(value) !== null || parseIpv6(value) !== null;
}

function ipv4Blocked(address: number): boolean {
  const inCidr = (base: number, bits: number) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (address & mask) === (base >>> 0 & mask);
  };
  return (
    inCidr(0x00000000, 8) ||
    inCidr(0x0a000000, 8) ||
    inCidr(0x7f000000, 8) ||
    inCidr(0xa9fe0000, 16) ||
    inCidr(0xac100000, 12) ||
    inCidr(0xc0a80000, 16) ||
    inCidr(0x64400000, 10) ||
    inCidr(0xc0000000, 24) ||
    inCidr(0xc0000200, 24) ||
    inCidr(0xc6336400, 24) ||
    inCidr(0xcb007100, 24) ||
    inCidr(0xe0000000, 4) ||
    inCidr(0xf0000000, 4)
  );
}

function ipv6Blocked(groups: number[]): boolean {
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;
  const first = groups[0] ?? 0;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;
  return false;
}

export function ipIsBlocked(ip: string): boolean {
  const lowered = ip.toLowerCase();
  const normalized = lowered.startsWith("::ffff:") ? lowered.slice(7) : lowered;
  const v4 = parseIpv4(normalized);
  if (v4 !== null) return ipv4Blocked(v4);
  if (lowered.startsWith("::ffff:")) return true;
  const v6 = parseIpv6(lowered);
  if (!v6) return true;
  return ipv6Blocked(v6);
}

export function hostIsBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "metadata.google.internal") return true;
  if (isIpAddress(host)) return ipIsBlocked(host);
  return false;
}
