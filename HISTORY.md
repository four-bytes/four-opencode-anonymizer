# Project Change History

## v0.3.0 — 2026-11-17

### Security (issue #52)
- **Fixed model-bound rehydration leak**: `experimental.text.complete` and `tool.execute.after` no longer rehydrate. Both hook outputs are persisted and replayed to the provider, so rehydration wrote originals into session history and every later request.
- **Display rehydration separated**: `rehydrateText()` renamed to `rehydrateForDisplay()`; no server hook imports it. Server plugins have no display-only hook.
- **Write-time scrub**: assistant text (`text.complete`) and tool output (`tool.execute.after`) are anonymized before opencode persists them.
- **Request-time catch-all**: new `experimental.chat.messages.transform` anonymizes history text, reasoning parts, tool input/output/error and `errorText`; `experimental.chat.system.transform` anonymizes system additions.
- **Session cleanup**: `session.deleted` drops the per-session store; `dispose` clears all stores.

### Added
- `src/model-bound.ts` — final anonymization gate for model-bound content.
- `docs/model-bound-paths.md` — path map with upstream evidence, detector limits, best-effort vs fail-closed classification.
- `test/model-bound-paths.test.ts` — synthetic multi-turn proof that no original reaches the provider payload.
- `test/detector-limits.test.ts` — pinned known misses (landlines, lowercase IBAN, NER not wired, binary attachments, …).

### Changed
- Plugin hooks expanded: `chat.message`, `experimental.text.complete`, `tool.execute.after`, `experimental.chat.messages.transform`, `experimental.chat.system.transform`, `event`, `dispose`.
- README security notes now state honestly what is best-effort.

### Tests
- 123 pass, 0 fail across 11 files.

## v0.2.1 — 2026-06-07

### Fixed
- Reference regex false-positive: "<REFERENCE_1>" word detected as PII #28 — added `\b` word boundary after keyword group

## v0.2.0 — 2026-06-06

### Added
- Enhanced PII detection (Issue #17): Credit cards (Luhn-validated), bank accounts, reference numbers
- International IBAN: Extended beyond DE to generic EU format (3–7 groups of 4)
- Tax ID refined: Keyword-triggered (Steuer-ID, St.-Nr., USt-IdNr.) to avoid false positives
- New PiiType values: `credit_card`, `bank_account`, `reference`
- Modes tests (Issue #17): Fresh test/modes.test.ts (12 tests covering all 4 modes)
- Plugin hook tests: test/four-opencode-anonymizer.test.ts (15 tests: anonymize, rehydrate, bleed prevention)
- 31 regex detector tests, 9 session-store tests

### Changed
- **BREAKING**: Replaced SQLite+AES MappingStore with in-memory SessionStore (Issue #17)
  - No more vault.db, vault.key, FOUR_ANON_KEY, XDG_DATA_HOME
  - Mappings are per-session Map — zero cross-session bleed
  - Destroyed on process exit
- anon-pipeline.ts: Uses SessionStore, removed sessionId parameter (store carries its own)
- rehydrate.ts: Session-scoped lookup via SessionStore
- Plugin (four-opencode-anonymizer.ts): Maps sessionId → SessionStore per session

### Removed
- src/mapping-store.ts (157 lines SQLite+AES)
- test/mapping-store.test.ts (7 tests, obsolete)
- All node:crypto usage (createCipheriv, createDecipheriv, etc.)

### Fixed
- debug-logger.test.ts: Removed spy race condition
- Cross-session bleed: getOriginal() no longer global — scoped to session Map

### Tests
- 101 pass, 0 fail, 218 expects across 9 files

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
