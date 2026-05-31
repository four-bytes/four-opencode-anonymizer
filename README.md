# @four-bytes/four-opencode-anonymizer

opencode-Plugin: Privacy-Gateway mit PII-Detection + reversibler Tokenisierung. Hook vor rag/memory/research/writer.

**Status:** Geplant für Wave P4c. Skeleton-Bootstrap aus Wave P0b.

## Geplantes Verhalten

- Hybrid-Engine: Regex (Email, IBAN, Phone, DE Tax-IDs) + optional lokales NER (`@xenova/transformers`, v0.2+)
- 4 Modi: `redact_for_llm`, `redact_for_logs`, `redact_for_memory`, `irreversible_export`
- Reversible Platzhalter: `<PERSON_1>`, `<EMAIL_2>` + lokaler Mapping-Vault (SQLite + Application-Level AES via Bun crypto)
- Audit-Diary: separater XDG-Pfad für GDPR-Nachweis
- Loading-Order: VOR tbg/curator (in opencode.json dokumentiert)

## Konzept-Quelle

- four-flames/four-ai-architecture/docs/patterns/PAT-006-pii-tokenization.md
- four-bytes/four-xims-meet/docs/01-konzept-fuer-maike.md (P36)
- Wave-Plan: four-bytes/opencode-plugins/WAVES-PLAN.md

## Implementation-Stand

Wave P4c (sequenziell nach P4a + P4b). 8 atomare Issues geplant:

1. Initial skeleton + Regex-Detector (Email, IBAN, Phone, DE Tax-IDs)
2. Mapping-Store (SQLite + AES, XDG-Pfad)
3. 4 Modi-Logik
4. chat.message Hook Integration
5. Rehydrate-Mechanismus
6. NER-Backend v0.2+ (@xenova/transformers)
7. Tests + DE-PII Fixture-Workspace
8. README + Sicherheits-Hinweise

## License
Apache-2.0
