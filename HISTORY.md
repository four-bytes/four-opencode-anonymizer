# Project Change History

## v0.4.0 — 2026-06-01

### Added
- 4 Modi (Issue #7): redact_for_llm, redact_for_logs, redact_for_memory, irreversible_export
- `src/modes.ts`: ModeConfig, getMode() via FOUR_ANON_MODE env
- `src/anon-pipeline.ts`: mode-aware Ersetzung (reversible vs generic placeholders)
- irreversible_export: [EMAIL], [IBAN], [PHONE], [TAX_ID], [API_KEY] — keine Mapping-Speicherung
- Tests: 6 mode tests (31 total)

## v0.3.0 — 2026-06-01

### Added
- Anonymization Pipeline (Issue #5): chat.message Hook anonymisiert User-Nachrichten vor LLM-Call
- `src/anon-pipeline.ts`: anonymizeText() — Detector → Store → Ersetzung
- Plugin-Entry: chat.message Hook mit RegexDetector + MappingStore
- Tests: 6 pipeline tests (email, store, multi-PII, clean, empty, session isolation)

## v0.2.0 — 2026-06-01

### Added
- Mapping-Store (Issue #3): SQLite + AES-256-CBC Vault für PII-Mappings
- `src/mapping-store.ts`: encrypt/decrypt via Bun crypto, Key-Management (env > file > auto-gen)
- UUID7-style IDs, WAL mode, session-isolation
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
- Initial Bootstrap (Wave P0b der opencode-plugins Strategy)
- README + AGENTS.md + LICENSE (Apache-2.0)
- Implementation kommt in Wave P4c
