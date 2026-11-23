import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as rotatePost } from "@/app/api/owner/pairing-token/route";
import { PAIRING_EXPIRED_MESSAGE, authorizeAddonPost, getPairingToken, resetAddonChecksForTests, rotatePairingToken, setPairingTokenForTests } from "@/server/addon-pairing";

const EXTENSION = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const dirs: string[] = [];

afterEach(() => {
  resetAddonChecksForTests();
  delete process.env.PRIZE_SCOUT_PAIRING_FILE;
  delete process.env.PRIZE_SCOUT_OWNER_TOKEN;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function extensionRequest(token: string): Request {
  return new Request("http://127.0.0.1:4342/api/addon/check", {
    method: "POST",
    headers: { origin: EXTENSION, authorization: `Bearer ${token}` },
  });
}

describe("pairing token rotation", () => {
  it("rejects the old token, accepts the new one, and writes the file atomically", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pairing-"));
    dirs.push(dir);
    const file = path.join(dir, "addon-pairing.json");
    process.env.PRIZE_SCOUT_PAIRING_FILE = file;
    setPairingTokenForTests("old-pairing-token");
    const created = rotatePairingToken();
    expect(created).not.toBe("old-pairing-token");
    expect(getPairingToken()).toBe(created);
    expect(authorizeAddonPost(extensionRequest("old-pairing-token"))).toEqual({
      ok: false,
      status: 401,
      message: PAIRING_EXPIRED_MESSAGE,
    });
    expect(authorizeAddonPost(extensionRequest(created))).toEqual({ ok: true });
    const saved = JSON.parse(readFileSync(file, "utf8")) as { token: string; previous: string };
    expect(saved.token).toBe(created);
    expect(saved.previous).toBe("old-pairing-token");
    expect(readdirSync(dir).some((name) => name.endsWith(".tmp"))).toBe(false);
  });

  it("returns 403 to a non-owner and does not write the token into logs", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pairing-"));
    dirs.push(dir);
    process.env.PRIZE_SCOUT_PAIRING_FILE = path.join(dir, "addon-pairing.json");
    process.env.PRIZE_SCOUT_OWNER_TOKEN = "owner-secret";
    setPairingTokenForTests("current-pairing-token");
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    });
    const info = vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    });
    const warn = vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    });
    const error = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((item) => String(item)).join(" "));
    });
    try {
      const stranger = await rotatePost(new Request("http://127.0.0.1:4342/api/owner/pairing-token", { method: "POST" }));
      expect(stranger.status).toBe(403);
      const wrong = await rotatePost(
        new Request("http://127.0.0.1:4342/api/owner/pairing-token", {
          method: "POST",
          headers: { "x-owner-token": "not-the-owner", origin: "http://127.0.0.1:4342" },
        }),
      );
      expect(wrong.status).toBe(403);
      const offHost = await rotatePost(
        new Request("http://evil.example/api/owner/pairing-token", {
          method: "POST",
          headers: { "x-owner-token": "owner-secret", origin: "http://127.0.0.1:4342" },
        }),
      );
      expect(offHost.status).toBe(403);
      const created = await rotatePost(
        new Request("http://127.0.0.1:4342/api/owner/pairing-token", {
          method: "POST",
          headers: { "x-owner-token": "owner-secret", origin: "http://127.0.0.1:4342" },
        }),
      );
      expect(created.status).toBe(200);
      const body = (await created.json()) as { token: string };
      const expired = authorizeAddonPost(extensionRequest("current-pairing-token"));
      expect(expired.ok).toBe(false);
      if (!expired.ok) expect(expired.message).toBe(PAIRING_EXPIRED_MESSAGE);
      expect(authorizeAddonPost(extensionRequest(body.token))).toEqual({ ok: true });
      const written = logs.join("\n");
      expect(written).not.toContain(body.token);
      expect(written).not.toContain("current-pairing-token");
      expect(written).not.toContain("owner-secret");
    } finally {
      spy.mockRestore();
      info.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("shows the server pairing message in the popup without a new extension build", () => {
    const popup = readFileSync(path.join(process.cwd(), "extension/popup.js"), "utf8");
    const manifest = readFileSync(path.join(process.cwd(), "extension/manifest.json"), "utf8");
    expect(popup).toContain("body.message");
    expect(manifest).toContain('"version": "0.2.2"');
  });
});
