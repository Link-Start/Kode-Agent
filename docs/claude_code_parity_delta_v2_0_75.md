# Claude Code v2.0.75 Parity Delta (Kode CLI)

Truth source (official):
- `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main 2/CHANGELOG.md`
- `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main 2/node_modules/@anthropic-ai/claude-code/cli.js`

Kode source (this repo):
- `src/entrypoints/cli.tsx`
- `src/query.ts`
- `src/permissions.ts`
- `src/utils/claudeCodeStructuredStdio.ts`
- `src/utils/claudeCodeStreamJson.ts`
- `src/utils/claudeCodeSessionLog.ts`
- `src/utils/claudeCodeSessionLoad.ts`

This document lists **what Claude Code v2.0.75 supports** (per changelog + runtime `cli.js`) and the **remaining gaps** in Kode needed for “Claude Code UI / Happy can drive Kode as a backend” parity.

## Executive Summary

Already aligned (high confidence):
- Tool parallelism barriers (`isConcurrencySafe`) and “Tool usage policy” system prompt are implemented in Kode (`src/query.ts`, `src/constants/prompts.ts`).
- `--print --output-format stream-json` one-shot output exists in Kode (`src/utils/claudeCodeStreamJson.ts`, `src/entrypoints/cli.tsx`).
- Claude Code-style session JSONL persistence exists in Kode (basic), but **record types + envelope fields differ** (`src/utils/claudeCodeSessionLog.ts`).

Critical gaps to reach v2.0.75 parity:
1) **Structured stdio control protocol**: official supports many `control_request` subtypes; Kode currently only handles inbound `interrupt`.
2) **Persistent stream-json session loop**: official SDK/host mode supports multiple prompts per process (queueing + replay/dup); Kode print mode is currently one-shot.
3) **Session log record model**: official writes `summary`, `custom-title` (/rename), and `tag` records, plus richer envelope fields; Kode currently writes only `user|assistant` + `file-history-snapshot`.
4) **Hooks system**: official supports hooks (e.g., `PreToolUse` command hooks); Kode currently has no `.claude/settings.json` hook runner.
5) **LSP tool**: official includes an `Lsp` tool (enabled when an LSP backend is available); Kode currently has no LSP tool.
6) **`--disable-slash-commands` flag**: official has it; Kode currently does not.
7) **MCP permissions wildcard**: official supports `mcp__server__*`; Kode currently lacks wildcard matching for MCP tool permissions.

## Claude Code v2.0.75: Key Features (from CHANGELOG.md) that Impact Parity

High-impact items (backend/protocol):
- `--disable-slash-commands` CLI flag (2.0.60) → Kode missing.
- Named sessions: `/rename` + resume by name (2.0.72/2.0.73) → Kode missing.
- MCP permission wildcard `mcp__server__*` (2.0.70) → Kode missing.
- Hooks: `PermissionRequest` hook + “apply permission updates” (2.0.45/2.0.54) → Kode missing.
- LSP tool (2.0.74) → Kode missing.

UX-only / optional parity (lower priority for “backend driving” but still noted):
- `/terminal-setup` expanded terminal support (2.0.74).
- SearchBox UX in resume/permissions/plugins screens (2.0.73).

## Tool Parity Snapshot (v2.0.75)

Official tool inventory (runtime `cli.js` + `sdk-tools.d.ts`):
- Present in Kode: `Bash`, `FileRead`, `FileWrite`, `FileEdit`, `Glob`, `Grep`, `WebFetch`, `WebSearch`, `TodoWrite`, `Task` (agent/subagent), `TaskOutput`, `KillShell`, `MCP` tools, `AskUserQuestion`, plan mode tools.
- Missing in Kode: `Lsp` tool (runtime exists in official `cli.js`, not present in Kode).

Notable schema/protocol mismatches:
- Official `can_use_tool` permission prompt payload includes fields Kode does not currently send: `permission_suggestions`, `blocked_path`, `decision_reason`, `tool_use_id`, `agent_id`.
- Official SDK `result` message includes additional fields (e.g. permission denials, errors) that Kode does not currently emit.

## Structured stdio Protocol Delta (print/SDK mode)

Official v2.0.75 behavior (from `cli.js` structured input loop):
- Input supports JSONL message types: `user`, `control_request`, `control_response`, `control_cancel_request`, `keep_alive`.
- Inbound `control_request` subtypes handled include:
  - `interrupt`
  - `initialize`
  - `set_permission_mode`
  - `set_model`
  - `set_max_thinking_tokens`
  - `mcp_status`
  - `mcp_message`
  - `mcp_set_servers`
  - `rewind_files`
- Outbound requests to host include (at least):
  - `can_use_tool`
  - `hook_callback`
  - `mcp_message`

Kode current behavior:
- `src/utils/claudeCodeStructuredStdio.ts` only handles inbound `control_request.subtype === "interrupt"`.
- `src/entrypoints/cli.tsx` sends `can_use_tool` requests, but the payload is missing several official fields and response parsing is narrower.
- Print mode is one-shot: reads a single user message and exits after emitting `result`.

## Session JSONL Persistence Delta (projects/<sanitized-cwd>/*.jsonl)

Official v2.0.75 (from `cli.js`):
- Stores messages as JSONL per session file and uses extra record types for UX:
  - `type:"summary"` with `{ summary, leafUuid }`
  - `type:"custom-title"` with `{ sessionId, customTitle }` (written by `/rename`)
  - `type:"tag"` with `{ sessionId, tag }`
  - `type:"file-history-snapshot"` records
- Message envelopes include richer fields (observed in `insertMessageChain`): `logicalParentUuid`, `agentId`, `slug`, `gitBranch`, `userType`, `cwd`, `sessionId`, `version`, `timestamp`, `isSidechain`, `parentUuid`.

Kode current behavior:
- Writer: `src/utils/claudeCodeSessionLog.ts` persists only `user|assistant` plus a first-line `file-history-snapshot`, with a reduced envelope (no `logicalParentUuid`, no `agentId`, no `slug`, `isSidechain` always false).
- Loader: `src/utils/claudeCodeSessionLoad.ts` only reconstructs `user|assistant` messages and ignores summary/title/tag metadata.

## Resume / Named Session Delta

Official:
- Supports resuming by name: `/rename` to name, `/resume <name>` in REPL, and `claude --resume <name>` in terminal.
- `--resume` with no value opens a resume selector UI.
- Resume UI supports multi-project lists and “different directory” warning when selecting a session from another cwd.

Kode current behavior:
- `/resume` exists but lists legacy Kode JSON logs (`src/screens/ResumeConversation.tsx` + `src/utils/log.ts`), not Claude Code session JSONL.
- `kode --resume` flag is implemented for UUID only and explicitly errors on `--resume` without value.

## Hooks Delta

Official:
- Supports `.claude/settings.json` hooks, e.g. `PreToolUse` command hooks (example: `examples/hooks/bash_command_validator_example.py`).
- Exit-code semantics: `2` blocks tool call and shows stderr to Claude; `1` shows stderr to user only.

Kode current behavior:
- No hooks config parsing or hook execution pipeline.

## Action Plan (mapped to todo_tasks.json)

- CC002: implement missing control_request subtypes + richer can_use_tool payload/response.
- CC003: implement persistent stream-json session loop for multi-turn hosts (Claude Code UI / Happy).
- CC004–CC006: align session JSONL record model + named sessions + resume UX.
- CC007: add `--disable-slash-commands` parity.
- CC008: add MCP permission wildcard matching.
- CC009: implement minimal hook runner (PreToolUse command hooks).
- CC010: implement `Lsp` tool (best-effort backend with conditional enabling).

