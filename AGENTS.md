# four-opencode-anonymizer — AGENTS.md

Standards-Pointer: `~/ai-shared-rules/AGENTS.md` + Meta-Repo `four-bytes/opencode-plugins` AGENTS.md.

## Convention
- Source-Datei: `src/four-opencode-anonymizer.ts` (NICHT src/index.ts)
- npm-Name: `@four-bytes/four-opencode-anonymizer`
- License: Apache-2.0
- ESM, Bun-targeted, strict TypeScript
- Vault: Application-Level AES (Bun crypto), KEIN SQLCipher
- NER (v0.2+): `@xenova/transformers` (ONNX, Bun-native)

## Wave
- P0b Bootstrap (jetzt)
- P4c Implementation (nach P4b tbg Policy-Engine)

- **Console logging:** Plugins MUST use `_client?.app?.log()` for all logging in plugin mode — `console.log` / `console.warn` / `console.error` is ONLY permitted for the initial startup `"init"` message. Console output in plugin mode breaks the terminal UI.
