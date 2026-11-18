# four-opencode-anonymizer

[![npm](https://img.shields.io/npm/v/@four-bytes/four-opencode-anonymizer)](https://www.npmjs.com/package/@four-bytes/four-opencode-anonymizer)
[![license](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![bun](https://img.shields.io/badge/runtime-bun-orange)](https://bun.sh)
OpenCode plugin: PII detection and anonymization before LLM calls. Mappings are reversible for **display** via an in-memory session store — no disk, no persistence, zero cross-session bleed. Model-bound content is never rehydrated; see [docs/model-bound-paths.md](docs/model-bound-paths.md).

## Installation

```json
{
  "plugin": ["@four-bytes/four-opencode-anonymizer"]
}
```

## Modes

Set via `FOUR_ANON_MODE` env (default: `redact_for_llm`):

| Mode | Placeholder | Mapping | Reversible |
|---|---|---|---|
| `redact_for_llm` | `<EMAIL_1>` | ✅ in-memory | ✅ |
| `redact_for_logs` | `<EMAIL_1>` | ✅ in-memory | ✅ |
| `redact_for_memory` | `<EMAIL_1>` | ✅ in-memory | ✅ |
| `irreversible_export` | `[EMAIL]` | ❌ | ❌ |

Reversible means the session store can resolve placeholders for a **display**
layer. It does not mean the plugin writes originals back into messages: for
**detected PII on covered paths**, the model receives placeholders only. This is
best-effort, not a guarantee — detector gaps, binary attachments, uncovered
paths and swallowed hook errors are listed in
[docs/model-bound-paths.md](docs/model-bound-paths.md#3-detector-limits). See
[Separating rehydration](#separating-rehydration).

## Detected PII Types (10 total)

### Regex Detector
- **Email**: any address matching the email pattern → `<EMAIL_1>`
- **IBAN (international)**: `DE89370400440532013000`, `FR76 3000 6000 0112...` → `<IBAN_1>`
- **Phone (DE)**: `+49 170 1234567` → `<PHONE_1>`
- **Tax ID** (keyword-triggered): `Steuer-ID: 12 345 678 901`, `USt-IdNr.: DE123456789` → `<TAX_ID_1>`
- **API Key**: `sk-proj-abc123...` → `<API_KEY_1>`
- **Credit Card** (Luhn-validated): `4111 1111 1111 1111` → `<CREDIT_CARD_1>`
- **Bank Account** (keyword-triggered): `Kontonummer: 1234567890`, `BLZ 37040044` → `<BANK_ACCOUNT_1>`
- **Reference** (keyword-triggered): `Referenz: ABC-12345`, `Kundennummer: KD-98765` → `<REFERENCE_1>`

### NER Detector (library only — not wired into the plugin)
- **Person names**: `Herr Müller`, `Frau Dr. Schmidt` → `<NAME_1>`
- **Cities**: `Berlin`, `München` → `<CITY_1>`

The plugin hot path uses the regex detector only. Names, cities and the other
known misses are listed in [docs/model-bound-paths.md](docs/model-bound-paths.md#3-detector-limits).

### Non-goals (not anonymized)
- Currency amounts: `1.234,67 €`, `$1,234.56`, `12.345,00 EUR`
- Bare numbers without keyword context (e.g. random 11-digit sequence)

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FOUR_ANON_MODE` | `redact_for_llm` | Anonymization mode |

## Store (in-memory, per-session)

- **No disk** — mappings live in memory only, destroyed on process exit
- **Session-scoped** — each `sessionID` gets its own isolated `Map`
- **Zero cross-session bleed** — `getOriginal()` is scoped to the session's `Map`
- **No encryption needed** — data never leaves process memory
- **Migration from v0.1.x**: `vault.db`, `vault.key`, and `FOUR_ANON_KEY` are no longer used

## Model-bound coverage

| Hook | What it protects |
|---|---|
| `chat.message` | User text before it is persisted (text/plain attachments are already expanded by opencode) |
| `experimental.text.complete` | Assistant text before it is persisted and replayed |
| `tool.execute.after` | Tool output before it is returned to the model and stored |
| `experimental.chat.messages.transform` | Catch-all: request history, reasoning, tool input/output/error |
| `experimental.chat.system.transform` | System prompt additions |
| `event` (`session.deleted`) / `dispose` | Drops in-memory session mappings |

Full path map with upstream evidence: [docs/model-bound-paths.md](docs/model-bound-paths.md).

## Separating rehydration

The plugin never rehydrates automatically. `rehydrateForDisplay(text, store)`
in `src/rehydrate.ts` is a pure helper for a display layer. It is deliberately
not called by any server hook, and it is not re-exported from the package entry
because a display layer would need the plugin's internal session store.

Rehydrating model-bound content would write originals into session history and
every later request. Server plugins have no display-only hook, so placeholders
are what the TUI shows by default. A future TUI component in this repo can call
the helper directly for rendering.

## Security Notes

- **irreversible_export**: No mappings stored — cannot be undone
- **Session isolation**: Each session has its own mappings, verified by cross-session bleed tests
- **Placeholder leakage**: Unknown placeholders (from other sessions/LLM hallucination) left as-is — never fabricated
- **No model-bound rehydration**: no hook imports `rehydrateForDisplay`; verified by the synthetic multi-turn test
- **Loading order**: Anonymizer MUST be loaded before other plugins (privacy gateway)
- **Honest scope**: detection is regex-based and best-effort. Binary attachments, title generation and pre-existing history are not fully covered. Hook errors are swallowed to keep sessions alive, which is fail-open for that request. Details: [best-effort vs fail-closed](docs/model-bound-paths.md#4-best-effort-vs-technically-fail-closed).

## Development

```bash
bun install
bun test        # 126 tests, 0 failures
bun run typecheck
bun run build
```

## License

Apache-2.0

---

> If this plugin saves you tokens, consider leaving a ⭐ on [GitHub](https://github.com/four-bytes/four-opencode-anonymizer).
