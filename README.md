# four-opencode-anonymizer

OpenCode plugin: PII detection and anonymization before LLM calls. Reversible via in-memory session store — no disk, no persistence, zero cross-session bleed.

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

## Detected PII Types (10 total)

### Regex Detector
- **Email**: `john.doe@example.com` → `<EMAIL_1>`
- **IBAN (international)**: `DE89370400440532013000`, `FR76 3000 6000 0112...` → `<IBAN_1>`
- **Phone (DE)**: `+49 170 1234567` → `<PHONE_1>`
- **Tax ID** (keyword-triggered): `Steuer-ID: 12 345 678 901`, `USt-IdNr.: DE123456789` → `<TAX_ID_1>`
- **API Key**: `sk-proj-abc123...` → `<API_KEY_1>`
- **Credit Card** (Luhn-validated): `4111 1111 1111 1111` → `<CREDIT_CARD_1>`
- **Bank Account** (keyword-triggered): `Kontonummer: 1234567890`, `BLZ 37040044` → `<BANK_ACCOUNT_1>`
- **Reference** (keyword-triggered): `Referenz: ABC-12345`, `Kundennummer: KD-98765` → `<REFERENCE_1>`

### NER Detector
- **Person names**: `Herr Müller`, `Frau Dr. Schmidt` → `<NAME_1>`
- **Cities**: `Berlin`, `München` → `<CITY_1>`

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

## Security Notes

- **irreversible_export**: No mappings stored — cannot be undone
- **Session isolation**: Each session has its own mappings, verified by cross-session bleed tests
- **Placeholder leakage**: Unknown placeholders (from other sessions/LLM hallucination) left as-is — never fabricated
- **Loading order**: Anonymizer MUST be loaded before other plugins (privacy gateway)

## Development

```bash
bun install
bun test        # 101 tests, 0 failures
bun run typecheck
bun run build
```

## License

Apache-2.0
