/**
 * In-memory per-session PII mapping store.
 * No disk, no encryption, no cross-session bleed.
 * Destroyed when process exits.
 */
export interface SessionStore {
  /** Store a PII original→placeholder mapping for this session */
  store(original: string, placeholder: string, piiType: string): void;
  /** Retrieve original PII from placeholder. Returns null if not found. */
  getOriginal(placeholder: string): string | null;
  /** List all mappings in this session (for debug/inspection) */
  list(): Array<{ placeholder: string; piiType: string; original: string }>;
  /** Remove all mappings for this session */
  clear(): void;
  /** Immutable session identifier */
  readonly sessionId: string;
}

export function createSessionStore(sessionId: string): SessionStore {
  const map = new Map<string, { original: string; piiType: string }>();

  return {
    sessionId,

    store(original: string, placeholder: string, piiType: string): void {
      map.set(placeholder, { original, piiType });
    },

    getOriginal(placeholder: string): string | null {
      const entry = map.get(placeholder);
      return entry ? entry.original : null;
    },

    list() {
      const result: Array<{ placeholder: string; piiType: string; original: string }> = [];
      for (const [placeholder, { original, piiType }] of map) {
        result.push({ placeholder, piiType, original });
      }
      return result;
    },

    clear(): void {
      map.clear();
    },
  };
}
