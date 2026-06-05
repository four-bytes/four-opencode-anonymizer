# Project Change History

## v0.6.0 — 2026-06-01

### Added
- NER Detector (Issue #11): Heuristic detection for person names (Herr/Frau/Dr.) + German cities
- Integration tests (Issue #13): End-to-end roundtrip (anonymize → LLM sim → rehydrate), session isolation
- README.md (Issue #12): Installation, modes, ENV vars, vault path, security notes
- src/types.ts: PiiType extended with `name` + `city`
- Tests: 6 NER + 3 integration = 39 total

## v0.5.0 — 2026-06-01

### Added
- Rehydrate (Issue #9): Assistant messages: placeholder → original PII via MappingStore
- `src/rehydrate.ts`: rehydrateText() with store lookup, reversible modes only
- Plugin entry: chat.message hook extended for role=assistant (rehydration)
- Tests: 5 rehydrate tests (30 total)

## v0.3.0 — 2026-06-01

### Added
- Anonymization pipeline (Issue #5): chat.message hook anonymizes user messages before LLM call
- `src/anon-pipeline.ts`: anonymizeText() — detector → store → replacement
- Plugin entry: chat.message hook with RegexDetector + MappingStore
- Tests: 6 pipeline tests (email, store, multi-PII, clean, empty, session isolation)

## v0.2.0 — 2026-06-01

### Added
- Mapping store (Issue #3): SQLite + AES-256-CBC vault for PII mappings
- `src/mapping-store.ts`: encrypt/decrypt via Bun crypto, key management (env > file > auto-gen)
- UUID7-style IDs, WAL mode, session isolation
- Tests: 7 cases (store/retrieve, unknown, multiple, list, isolation, clear, encrypted-at-rest)
- `.gitignore`: vault.db, vault.key

## v0.1.0 — 2026-06-01

### Added
- Initial plugin skeleton (Issue #1): package.json, tsconfig, src/ structure
- RegexDetector: email, IBAN (DE), phone (+49/0049/0), tax ID (11-digit), API keys
- PiiMatch + AnonymizedContent types in src/types.ts
- 12 detector tests (email x3, iban x2, phone x2, tax, api key, clean text, overlap, empty, count)
- Build + typecheck setup via bun

## v0.0.1 — 2026-05-31

### Added
- Initial bootstrap (Wave P0b of opencode-plugins strategy)
- README + AGENTS.md + LICENSE (Apache-2.0)
- Implementation follows in Wave P4c
