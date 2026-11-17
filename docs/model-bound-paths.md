# Model-bound path map (issue #52)

Investigation first. This document maps every path by which content can reach
the LLM provider, states what the plugin does on each path, and separates what
is **technically fail-closed** from what is **best-effort**. It is not a claim
that a vulnerability was proven exploitable; the rehydration issue below was a
design flaw that is now closed.

Evidence base:

- Plugin repo commit `b8a3706` (main before this branch).
- opencode reference clone `opencode-src` at commit `3f8140266`.
  Paths below are relative to `packages/opencode/src/`.
- Synthetic proof: `test/model-bound-paths.test.ts`.
- Known detection gaps: `test/detector-limits.test.ts`.

## 1. Where content becomes model-bound

| # | Path | Evidence | Content | Status in this plugin |
|---|---|---|---|---|
| 1 | User text parts | `session/prompt.ts:983` — `chat.message` fires, then `sessions.updateMessage/updatePart` persists at `prompt.ts:1021-1022` | User prompt text | Anonymized before persist (`chat.message`) |
| 2 | Attached `text/plain` files | `prompt.ts:771-780` — the file part is expanded into synthetic text parts before the hook | File text | Covered as text parts |
| 3 | Binary attachments (PDF/image) | `session/message-v2.ts:225-233` — passed as media (`file` part) | Binary payload | **Not scanned** (text detectors cannot inspect it) |
| 4 | Assistant text | `session/processor.ts:811-836` — hook output is assigned to `currentText.text` and persisted via `updatePart`; replayed at `message-v2.ts:289-300` | Model output | Scrubbed before persist (no rehydration) |
| 5 | Reasoning parts | `message-v2.ts:373-386` — replayed as `reasoning` (or as text for a different model) | Model reasoning | Scrubbed by request-time transform |
| 6 | Tool input (arguments) | `message-v2.ts:303-338` — `part.state.input` is sent with the tool call | Model-generated args | Scrubbed by request-time transform |
| 7 | Tool output | `session/tools.ts:103-147` — `output` is returned and stored via `completeToolCall`; MCP tools pass `content[]` instead (`tools.ts:116-150`); Task tool at `prompt.ts:374-390`; replayed at `message-v2.ts:303-338` | Tool results | Scrubbed at `tool.execute.after` (`output` and MCP `content[].text`) and again by the transform |
| 8 | Tool error text | `message-v2.ts:336-370` — `state.error` and interrupted `metadata.output` become `errorText`/output | Error strings | Scrubbed by request-time transform |
| 9 | System prompt additions | `session/llm/request.ts:60-70` — agent prompt, env, instructions, skills, user system joined, then `experimental.chat.system.transform` | System text | Scrubbed by `experimental.chat.system.transform` |
| 10 | Request history (all prior parts) | `prompt.ts:1325-1331` — `experimental.chat.messages.transform` immediately before `toModelMessagesEffect` | Everything above, replayed | Anonymized again at request time (catch-all) |
| 11 | Compaction request | `session/compaction.ts:360-364` — transform runs, then `toModelMessagesEffect` | Selected history | Covered |
| 12 | Title generation | `prompt.ts:208` — `toModelMessagesEffect(context, mdl)` **without** `messages.transform` | First user message + context | Not covered by the transform; relies on paths 1-9 having been scrubbed at write time |
| 13 | Compaction "recent" serialization | `compaction.ts:365-374` — `toModelMessagesEffect(history.slice(tailIndex))` without another transform | Raw history JSON | Same residual gap as #12 |

The model-bound gate therefore has two layers:

1. **Write-time scrub** — `chat.message`, `experimental.text.complete`,
   `tool.execute.after` clean content before opencode persists it.
2. **Request-time scrub** — `experimental.chat.messages.transform` and
   `experimental.chat.system.transform` clean the assembled payload as a
   catch-all for history written before the plugin loaded, other plugins'
   additions, and regressions.

## 2. Rehydration separation (the bug that was closed)

Before this issue:

- `experimental.text.complete` called `rehydrateText()` and returned the result.
  opencode assigns that value to the text part and **persists it**
  (`processor.ts:811-836`), so originals became session history and were
  replayed in every later request.
- `tool.execute.after` called `rehydrateText()` on `output.output`; opencode
  returns that object to the model and stores it in the tool part
  (`tools.ts:103-147`, `prompt.ts:374-390`), again injecting originals into
  later requests.

After this issue:

- No server hook calls rehydration. `rehydrateForDisplay()` in
  `src/rehydrate.ts` is a pure display helper and is documented as forbidden
  for model-bound data.
- opencode has no display-only hook for server plugins, so the plugin does not
  rehydrate automatically at all. Placeholders are what both the model and the
  TUI see. A TUI/CLI layer may call `rehydrateForDisplay()` if it has a store.
- `experimental.text.complete` and `tool.execute.after` now anonymize instead.
  `experimental.chat.messages.transform` anonymizes the assembled payload once
  more.

Proof: the synthetic two-turn test in `test/model-bound-paths.test.ts` drives
all hooks, builds the next provider payload and asserts that no original
(email, phone, file content, model echo, system addition) occurs in the
serialized payload. A second test feeds deliberately leaky history (raw
originals in text, reasoning, tool input/output/error, system) into the
request-time transform and asserts the payload is clean.

## 3. Detector limits

The plugin uses `RegexDetector` only. The NER detector exists in
`src/detectors/ner.ts` but is **not wired** into the plugin. Known misses
(pinned by `test/detector-limits.test.ts`):

- German landlines (`030 …`) — only mobile `15/16/17` prefixes match.
- Non-German phone numbers (`+1 …`).
- Lowercase IBANs.
- Tax IDs without a keyword trigger.
- API keys without `sk_`/`api_`/`key_` prefix (e.g. AWS `AKIA…`).
- Names and cities (NER not active).
- Spaced/obfuscated forms (`alice @ example . com`, `alice[at]…`).
- PII split across message parts or across messages.
- Binary attachments (PDF/image) — no text to scan.
- Any encoding the regex does not anticipate (base64, images, unicode tricks).

## 4. Best-effort vs technically fail-closed

Fail-closed means: if the mechanism runs, the sensitive value cannot reach the
provider. This plugin is **not globally fail-closed**. Honest classification:

**Technically fail-closed within a covered path**

- Once a placeholder exists, model-bound content is never rehydrated: no server
  hook imports `rehydrateForDisplay`, so a later request cannot recover the
  original from the store.
- The request-time transform rewrites every text/reasoning/tool input/output/
  error/system string it can see before `toModelMessagesEffect`. If it runs, a
  detectable original in those fields is removed.
- Session isolation is enforced by per-session maps; a placeholder from another
  session is left as-is, never resolved.

**Best-effort only**

- Detection coverage: undetected PII passes through unchanged (section 3).
- Binary/non-text payloads are not inspected.
- Paths #12 and #13 (title generation, compaction "recent" JSON) bypass the
  request-time transform. They are only protected if write-time scrubbing
  happened. History written before the plugin was loaded can still surface
  there.
- Hook exceptions are swallowed (`.catch` / `try { } catch { }`) so a broken
  detector never blocks a session. If anonymization throws, content is left
  unmodified — that is fail-open by design, chosen over breaking the session.
- Plugin load order matters: another plugin that writes directly to session
  storage after our write-time hooks but before the request-time transform is
  only covered if it feeds the normal message pipeline.
- Tool **execution** sees the model's arguments as produced. The plugin does not
  rewrite arguments at `tool.execute.before` (that would change tool semantics);
  it scrubs the model-bound copy at request time. A placeholder is therefore
  what the model and the stored history contain, while a tool invoked in the
  same turn may still receive an original if the model echoed one.
- Logging is metadata-only (`logDebugEvent`), but opencode's own logs and
  provider-side retention are outside this plugin's control.

## 5. Session cleanup

- Stores are created lazily per `sessionID`.
- `event` hook: on `session.deleted`, remove the store
  (`event.properties.info.id`, same shape used by opencode's codex plugin at
  `plugin/openai/codex.ts:360-361`).
- `dispose` hook: clear all stores on plugin shutdown.
- Process exit destroys the remaining in-memory maps; nothing is written to
  disk.
- If a delete event were missed, the map would grow for the process lifetime
  (memory, not a leak of data to the model). This is best-effort cleanup, not a
  hard TTL.

## 6. Residual risks / follow-ups

- Wire the NER detector into the plugin hot path (currently unused).
- Consider a TUI display component that calls `rehydrateForDisplay()`, since
  server plugins have no display-only hook.
- Re-check upstream for a transform hook on the title-generation path; if one
  appears, cover it.
- Consider provider-level outbound auditing (not possible inside this plugin).
