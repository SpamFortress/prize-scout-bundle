import { BlockList, isIP } from "node:net";

const block = new BlockList();
block.addSubnet("0.0.0.0", 8, "ipv4");
block.addSubnet("10.0.0.0", 8, "ipv4");
block.addSubnet("127.0.0.0", 8, "ipv4");
block.addSubnet("169.254.0.0", 16, "ipv4");
block.addSubnet("172.16.0.0", 12, "ipv4");
block.addSubnet("192.168.0.0", 16, "ipv4");
block.addSubnet("100.64.0.0", 10, "ipv4");
block.addSubnet("192.0.0.0", 24, "ipv4");
block.addSubnet("192.0.2.0", 24, "ipv4");
block.addSubnet("198.51.100.0", 24, "ipv4");
block.addSubnet("203.0.113.0", 24, "ipv4");
block.addSubnet("224.0.0.0", 4, "ipv4");
block.addSubnet("240.0.0.0", 4, "ipv4");
block.addAddress("255.255.255.255", "ipv4");
block.addAddress("::1", "ipv6");
block.addAddress("::", "ipv6");
block.addSubnet("fc00::", 7, "ipv6");
block.addSubnet("fe80::", 10, "ipv6");

export function ipIsBlocked(ip: string): boolean {
  const normalized = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
  if (!isIP(normalized)) return true;
  const family = normalized.includes(":") ? "ipv6" : "ipv4";
  return block.check(normalized, family);
}

export function hostIsBlocked(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host === "metadata.google.internal") return true;
  if (isIP(host)) return ipIsBlocked(host);
  return false;
}
