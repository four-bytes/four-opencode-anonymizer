# four-opencode-anonymizer

opencode Plugin: PII-Erkennung und Anonymisierung vor LLM-Calls. Reversibel via SQLite+AES Vault.

## Installation

```json
{
  "plugin": ["@four-bytes/four-opencode-anonymizer"]
}
```

## Modi

Gesetzt via `FOUR_ANON_MODE` env (default: `redact_for_llm`):

| Modus | Platzhalter | Mapping | Reversibel |
|---|---|---|---|
| `redact_for_llm` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `redact_for_logs` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `redact_for_memory` | `<EMAIL_1>` | ✅ SQLite | ✅ |
| `irreversible_export` | `[EMAIL]` | ❌ | ❌ |

## Erkannte PII-Typen

### Regex-Detector (v0.1+)
- **Email**: `john.doe@example.com` → `<EMAIL_1>`
- **IBAN (DE)**: `DE89370400440532013000` → `<IBAN_1>`
- **Telefon (DE)**: `+49 170 1234567` → `<PHONE_1>`
- **Steuer-ID**: `12 345 678 901` → `<TAX_ID_1>`
- **API-Key**: `sk-proj-abc123...` → `<API_KEY_1>`

### NER-Detector (v0.2+)
- **Personennamen**: `Herr Müller`, `Frau Dr. Schmidt` → `<NAME_1>`
- **Städte**: `Berlin`, `München` → `<CITY_1>`

## ENV-Variablen

| Variable | Default | Beschreibung |
|---|---|---|
| `FOUR_ANON_MODE` | `redact_for_llm` | Anonymisierungs-Modus |
| `FOUR_ANON_KEY` | auto-generiert | AES-256 Schlüssel (hex) |

## Vault

- **Pfad**: `${XDG_DATA_HOME:-~/.local/share}/four-opencode-anonymizer/vault.db`
- **Key**: `${XDG_DATA_HOME:-~/.local/share}/four-opencode-anonymizer/vault.key`
- **Schema**: `mappings(id, pii_type, iv, ciphertext, placeholder, session_id, created_at)`
- **Verschlüsselung**: AES-256-CBC pro Eintrag mit zufälligem IV

## Sicherheits-Hinweise

- **Vault-Backup**: Key-Datei (`vault.key`) separat und sicher aufbewahren — ohne Key sind alle Mappings verloren
- **Key-Rotation**: `FOUR_ANON_KEY` neu setzen → alte Mappings nicht mehr lesbar
- **irreversible_export**: Keine Mappings gespeichert — kann nicht rückgängig gemacht werden
- **Session-Isolation**: Jede Session hat eigene Mappings (session_id)
- **Loading-Order**: Anonymizer MUSS vor anderen Plugins geladen werden (Privacy-Gateway)

## Entwicklung

```bash
bun install
bun test
bun run typecheck
bun run build
```

## Lizenz

Apache-2.0
