# four-opencode-anonymizer

OpenCode plugin: PII detection and anonymization before LLM calls. Reversible via SQLite+AES vault.

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
| `redact_for_llm` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `redact_for_logs` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `redact_for_memory` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `irreversible_export` | `[EMAIL]` | ❌ | ❌ |

## Detected PII Types

### Regex Detector (v0.1+)
- **Email**: `john.doe@example.com` → `<EMAIL_1>`
- **IBAN (DE)**: `DE89370400440532013000` → `<IBAN_1>`
- **Phone (DE)**: `+49 170 1234567` → `<PHONE_1>`
- **Tax ID**: `12 345 678 901` → `<TAX_ID_1>`
- **API Key**: `sk-proj-abc123...` → `<API_KEY_1>`

### NER Detector (v0.2+)
- **Person names**: `Herr Müller`, `Frau Dr. Schmidt` → `<NAME_1>`
- **Cities**: `Berlin`, `München` → `<CITY_1>`

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `FOUR_ANON_MODE` | `redact_for_llm` | Anonymization mode |
| `FOUR_ANON_KEY` | auto-generated | AES-256 key (hex) |

## Vault

- **Path**: `${XDG_DATA_HOME:-~/.local/share}/four-opencode-anonymizer/vault.db`
- **Key**: `${XDG_DATA_HOME:-~/.local/share}/four-opencode-anonymizer/vault.key`
- **Schema**: `mappings(id, pii_type, iv, ciphertext, placeholder, session_id, created_at)`
- **Encryption**: AES-256-CBC per entry with random IV

## Security Notes

- **Vault backup**: Keep the key file (`vault.key`) separate and safe — without the key all mappings are lost
- **Key rotation**: Set a new `FOUR_ANON_KEY` → old mappings become unreadable
- **irreversible_export**: No mappings stored — cannot be undone
- **Session isolation**: Each session has its own mappings (session_id)
- **Loading order**: Anonymizer MUST be loaded before other plugins (privacy gateway)

## Development

```bash
bun install
bun test
bun run typecheck
bun run build
```

## License

Apache-2.0
