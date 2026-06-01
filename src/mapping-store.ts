import { Database } from "bun:sqlite";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ALGORITHM = "aes-256-cbc";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

function getDataDir(): string {
  const base = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
  return join(base, "four-opencode-anonymizer");
}

function getDbPath(): string {
  return join(getDataDir(), "vault.db");
}

function getKeyPath(): string {
  return join(getDataDir(), "vault.key");
}

/** Returns encryption key (32 bytes). Loads from env, or auto-generates and persists. */
function getEncryptionKey(): Buffer {
  // Priority 1: environment variable
  const envKey = process.env.FOUR_ANON_KEY;
  if (envKey) {
    return createHash("sha256").update(envKey).digest(); // always 32 bytes
  }

  // Priority 2: persisted key file
  const keyPath = getKeyPath();
  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, "utf-8"), "hex");
  }

  // Priority 3: auto-generate and save
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const key = randomBytes(KEY_LENGTH);
  writeFileSync(keyPath, key.toString("hex"), "utf-8");
  return key;
}

function encrypt(plaintext: string): { iv: string; ciphertext: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    ciphertext: encrypted.toString("hex"),
  };
}

function decrypt(ivHex: string, ciphertextHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf-8");
}

export interface MappingStore {
  /** Store a PII original→placeholder mapping */
  store(original: string, placeholder: string, piiType: string, sessionId: string): void;
  /** Retrieve original PII from placeholder. Returns null if not found. */
  getOriginal(placeholder: string): string | null;
  /** List all mappings for a session */
  listBySession(sessionId: string): Array<{ placeholder: string; piiType: string }>;
  /** Delete all mappings for a session. Returns count of removed rows. */
  clearSession(sessionId: string): number;
  /** Close database connection */
  close(): void;
}

export function createMappingStore(dbPath?: string): MappingStore {
  const path = dbPath || getDbPath();
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS mappings (
      id TEXT PRIMARY KEY,
      pii_type TEXT NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      placeholder TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_mappings_placeholder ON mappings(placeholder)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_mappings_session ON mappings(session_id)");

  const insertStmt = db.prepare(
    "INSERT INTO mappings (id, pii_type, iv, ciphertext, placeholder, session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  const getByPlaceholder = db.prepare(
    "SELECT iv, ciphertext FROM mappings WHERE placeholder = ? LIMIT 1",
  );
  const listBySessionStmt = db.prepare(
    "SELECT placeholder, pii_type FROM mappings WHERE session_id = ?",
  );
  const deleteBySession = db.prepare(
    "DELETE FROM mappings WHERE session_id = ?",
  );

  // Helper for UUID7-style IDs
  let idCounter = 0;
  function nextId(): string {
    const ts = Date.now().toString(16).padStart(12, "0");
    const rand = randomBytes(4).toString("hex");
    const counter = (++idCounter).toString(16).padStart(4, "0");
    return `${ts}-${rand}-${counter}`;
  }

  return {
    store(original: string, placeholder: string, piiType: string, sessionId: string): void {
      const { iv, ciphertext } = encrypt(original);
      insertStmt.run(nextId(), piiType, iv, ciphertext, placeholder, sessionId, Date.now());
    },

    getOriginal(placeholder: string): string | null {
      const row = getByPlaceholder.get(placeholder) as { iv: string; ciphertext: string } | undefined;
      if (!row) return null;
      try {
        return decrypt(row.iv, row.ciphertext);
      } catch {
        return null;
      }
    },

    listBySession(sessionId: string) {
      return listBySessionStmt.all(sessionId) as Array<{ placeholder: string; piiType: string }>;
    },

    clearSession(sessionId: string): number {
      return deleteBySession.run(sessionId).changes;
    },

    close(): void {
      db.close();
    },
  };
}
