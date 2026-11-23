import { BlockList, isIP } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupPublic } from "@/server/check-page";
import { hostIsBlocked, ipIsBlocked, isIpAddress } from "@/server/ssrf";

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

function legacyBlocked(ip: string): boolean {
  const normalized = ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
  if (!isIP(normalized)) return true;
  const family = normalized.includes(":") ? "ipv6" : "ipv4";
  return block.check(normalized, family);
}

const SAMPLES = [
  "127.0.0.1",
  "10.1.2.3",
  "172.16.0.1",
  "172.31.255.255",
  "172.32.0.1",
  "192.168.1.1",
  "169.254.1.1",
  "100.64.0.1",
  "100.127.255.255",
  "100.128.0.1",
  "192.0.0.8",
  "192.0.2.1",
  "198.51.100.1",
  "203.0.113.1",
  "224.0.0.1",
  "240.0.0.1",
  "255.255.255.255",
  "0.0.0.0",
  "8.8.8.8",
  "93.184.216.34",
  "1.1.1.1",
  "::1",
  "::",
  "fc00::1",
  "fd12:3456::1",
  "fe80::1",
  "2001:4860:4860::8888",
  "::ffff:127.0.0.1",
  "::ffff:93.184.216.34",
  "::ffff:7f00:1",
  "64:ff9b::8.8.8.8",
  "127.0.0.01",
  "not-an-ip",
];

describe("public address check", () => {
  it("keeps the same private-network decisions without node:net", () => {
    for (const sample of SAMPLES) {
      expect(isIpAddress(sample), sample).toBe(isIP(sample) !== 0);
      expect(ipIsBlocked(sample), sample).toBe(legacyBlocked(sample));
    }
    expect(hostIsBlocked("localhost")).toBe(true);
    expect(hostIsBlocked("printer.local")).toBe(true);
    expect(hostIsBlocked("metadata.google.internal")).toBe(true);
    expect(hostIsBlocked("example.com")).toBe(false);
    expect(hostIsBlocked("127.0.0.1")).toBe(true);
  });

  it("resolves through DNS over HTTPS and returns an address unchanged", async () => {
    const fetchImpl = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input));
      const type = url.searchParams.get("type");
      const answer = type === "AAAA" ? [] : [{ type: 1, data: "93.184.216.34" }];
      return Response.json({ Status: 0, Answer: answer });
    });
    try {
      await expect(lookupPublic("93.184.216.34")).resolves.toEqual(["93.184.216.34"]);
      await expect(lookupPublic("example.com")).resolves.toEqual(["93.184.216.34"]);
      expect(String(fetchImpl.mock.calls[0]?.[0])).toContain("https://cloudflare-dns.com/dns-query");
    } finally {
      fetchImpl.mockRestore();
    }
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
