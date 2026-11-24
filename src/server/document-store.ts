import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface DocumentWriteOptions {
  mode?: number;
}

/** One JSON document per key. The local app uses files. Workers use D1. */
export interface DocumentStore {
  read(key: string): Promise<string | null>;
  write(key: string, value: string, options?: DocumentWriteOptions): Promise<void>;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Like {
  prepare(query: string): D1Statement;
}

function safeKey(key: string): string {
  if (!/^[a-z0-9-]{1,64}$/.test(key)) throw new Error("Document key is not a file name.");
  return key;
}

export function readFsDocument(directory: string, key: string): string | null {
  try {
    return readFileSync(path.join(directory, `${safeKey(key)}.json`), "utf8");
  } catch {
    return null;
  }
}

export function writeFsDocument(directory: string, key: string, value: string, options?: DocumentWriteOptions): void {
  const name = safeKey(key);
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${name}.json`);
  const tmp = path.join(directory, `.${name}.${process.pid}.tmp`);
  writeFileSync(tmp, value, options?.mode === undefined ? undefined : { mode: options.mode });
  try {
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* The temp file is removed when the rename can be undone. */
    }
    throw error;
  }
}

/** Files under data/, the same place the practice app already writes. */
export function fsDocumentStore(directory: string): DocumentStore {
  return {
    async read(key) {
      return readFsDocument(directory, key);
    },
    async write(key, value, options) {
      writeFsDocument(directory, key, value, options);
    },
  };
}

/** One row per document. Used only with a local D1 database. */
export function d1DocumentStore(db: D1Like): DocumentStore {
  return {
    async read(key) {
      const row = await db.prepare("SELECT value FROM app_documents WHERE key = ?").bind(safeKey(key)).first<{ value: string }>();
      return row?.value ?? null;
    },
    async write(key, value) {
      await db
        .prepare("INSERT INTO app_documents (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(safeKey(key), value)
        .run();
    },
  };
}

export function dataDirectory(): string {
  return process.env.PRIZE_SCOUT_DATA_DIR?.trim() || path.join(process.cwd(), "data");
}

/** The practice app keeps using files unless PRIZE_SCOUT_STORE=d1 is set on Workers. */
export function defaultDocumentStore(): DocumentStore {
  if (process.env.PRIZE_SCOUT_STORE === "d1") {
    throw new Error("The D1 document store is opened with openDocumentStore().");
  }
  return fsDocumentStore(dataDirectory());
}

/** Files on the Mac. D1 when PRIZE_SCOUT_STORE=d1, which the local Workers preview sets. */
export async function openDocumentStore(): Promise<DocumentStore> {
  if (process.env.PRIZE_SCOUT_STORE !== "d1") return defaultDocumentStore();
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const db = (env as { PRIZE_SCOUT_DB?: D1Like }).PRIZE_SCOUT_DB;
  if (!db) throw new Error("D1 binding PRIZE_SCOUT_DB is not configured.");
  return d1DocumentStore(db);
}
