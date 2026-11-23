import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a free port."));
        return;
      }
      server.close(() => resolve(address.port));
    });
    server.on("error", reject);
  });
}

const DIST_DIR = ".next-vitest";
const TEST_TSCONFIG = "tsconfig.vitest.json";

const EMPTY_PRERENDER_MANIFEST = {
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: "vitest",
    previewModeSigningKey: "vitest-signing-key",
    previewModeEncryptionKey: "vitest-encryption-key",
  },
};

/** A tsconfig Next may rewrite. The project tsconfig.json is left unchanged. */
export function prepareIsolatedTypeScriptConfig(root = process.cwd()): { env: Record<string, string>; cleanup: () => void } {
  const sourcePath = path.join(root, "tsconfig.json");
  const before = readFileSync(sourcePath, "utf8");
  const parsed = JSON.parse(before) as { include?: string[] };
  const include = Array.isArray(parsed.include) ? [...parsed.include] : ["next-env.d.ts", "**/*.ts", "**/*.tsx"];
  const types = `${DIST_DIR}/types/**/*.ts`;
  if (!include.includes(types)) include.push(types);
  parsed.include = include;
  writeFileSync(path.join(root, TEST_TSCONFIG), `${JSON.stringify(parsed, null, 2)}\n`);
  return {
    env: { PRIZE_SCOUT_TSCONFIG: TEST_TSCONFIG, PRIZE_SCOUT_DIST_DIR: DIST_DIR },
    cleanup: () => {
      rmSync(path.join(root, TEST_TSCONFIG), { force: true });
      const current = readFileSync(sourcePath, "utf8");
      if (current !== before) writeFileSync(sourcePath, before);
    },
  };
}

function removeDist() {
  rmSync(path.join(process.cwd(), DIST_DIR), { recursive: true, force: true });
}

function seedDist() {
  const dir = path.join(process.cwd(), DIST_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "prerender-manifest.json"), `${JSON.stringify(EMPTY_PRERENDER_MANIFEST)}\n`);
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      resolve();
    }, 4000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      process.kill(-child.pid!, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  });
}

/** Starts this package on its own port and dist directory. It does not use port 4342. */
export async function startEphemeralScout(extraEnv: Record<string, string> = {}): Promise<{ origin: string; stop: () => Promise<void> }> {
  let port = await freePort();
  if (port === 4342) port = await freePort();
  if (port === 4342) throw new Error("The only free port offered was the preview port 4342.");
  const origin = `http://127.0.0.1:${port}`;
  const nextEnvPath = path.join(process.cwd(), "next-env.d.ts");
  let nextEnvBefore: string | null = null;
  try {
    nextEnvBefore = readFileSync(nextEnvPath, "utf8");
  } catch {
    nextEnvBefore = null;
  }
  const isolated = prepareIsolatedTypeScriptConfig();
  const restoreProjectFiles = () => {
    isolated.cleanup();
    if (nextEnvBefore === null) rmSync(nextEnvPath, { force: true });
    else {
      const current = readFileSync(nextEnvPath, "utf8");
      if (current !== nextEnvBefore) writeFileSync(nextEnvPath, nextEnvBefore);
    }
  };
  removeDist();
  seedDist();
  const child = spawn(
    process.execPath,
    [path.join(process.cwd(), "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, ...extraEnv, ...isolated.env },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    log = (log + chunk.toString()).slice(-4000);
  });
  const started = Date.now();
  while (Date.now() - started < 90_000) {
    if (child.exitCode !== null) {
      restoreProjectFiles();
      removeDist();
      throw new Error(`The test server exited ${child.exitCode} before it was healthy.\n${log}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`);
      if (response.ok) {
        return {
          origin,
          stop: async () => {
            await stopChild(child);
            restoreProjectFiles();
            removeDist();
          },
        };
      }
    } catch {
      // The server is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  await stopChild(child);
  restoreProjectFiles();
  removeDist();
  throw new Error(`The test server did not answer /api/health on ${origin}.\n${log}`);
}
