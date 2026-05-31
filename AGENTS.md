# four-opencode-anonymizer — AGENTS.md

Standards-Pointer: `~/.personal-config/ai-shared/AGENTS.md` + Meta-Repo `four-bytes/opencode-plugins` AGENTS.md.

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
