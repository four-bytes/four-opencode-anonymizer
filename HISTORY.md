# Project Change History

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
