# Claude Code UI / Happy ↔ Kode CLI Compatibility Matrix

Goal: make these frontends able to drive **Kode CLI** as a drop-in “Claude Code CLI-compatible” backend.

Truth source (official behavior):
- `cc_official/claude-code-main 2/node_modules/@anthropic-ai/claude-code/cli.js`

Frontend sources that define the expectations:
- `cc_official/claudecodeui/server/projects.js` (projects/sessions discovery)
- `cc_official/claudecodeui/server/index.js` (chat+shell backends)
- `cc_official/claudecodeui/server/routes/mcp.js` (spawns `claude mcp ...`)
- `cc_official/happy-cli/src/claude/claudeLocal.ts` (interactive local `claude` spawn)
- `cc_official/happy-cli/src/claude/sdk/query.ts` (print-mode `--output-format stream-json`)
- `cc_official/happy-cli/src/claude/sdk/types.ts` (stream-json message/control protocol)

Kode current implementation (key locations):
- CLI entrypoint: `src/entrypoints/cli.tsx`
- Message loop: `src/query.ts`
- Task output parity: `src/tools/TaskOutputTool/TaskOutputTool.tsx`, `src/utils/taskOutputStore.ts`
- Current message logs: `src/utils/log.ts` (writes `*.json` under `${CLAUDE_BASE_DIR}/<sanitized>/messages/`)
- Config base dir compat: `src/utils/env.ts` (`KODE_CONFIG_DIR` / `CLAUDE_CONFIG_DIR`)

## 1) Project/session file layout (hard dependency for claudecodeui)

**Official Claude Code (observed in `~/.claude/projects/.../*.jsonl`):**
- Projects root: `~/.claude/projects/`
- Project directory name: sanitized cwd (`/Users/me/repo` → `-Users-me-repo`) via `path.replace(/[^a-zA-Z0-9]/g,"-")` (see `bc()` in official `cli.js`).
- Session file: `~/.claude/projects/<projectDir>/<sessionId>.jsonl`
- Agent file: `~/.claude/projects/<projectDir>/agent-<agentId>.jsonl`
- Records are JSONL envelopes containing at least: `type`, `uuid`, `parentUuid`, `cwd`, `sessionId`, `version`, `timestamp`, and a `message` field matching the Anthropic message shape.

**Frontend expectation (claudecodeui):**
- Watches `~/.claude/projects` (hard-coded) and discovers sessions by scanning `*.jsonl` and reading `cwd` (see `cc_official/claudecodeui/server/projects.js`).

**Kode status: GAP**
- Kode stores message logs under `${CLAUDE_BASE_DIR}/<sanitized>/messages/*.json` (`src/utils/log.ts`) and does not write `projects/<projectDir>/*.jsonl`.

**Acceptance criteria:**
- Kode writes Claude Code-compatible JSONL under `${CLAUDE_BASE_DIR}/projects/<sanitized-cwd>/`.
- Session files are discoverable by claudecodeui without UI changes (when `CLAUDE_CONFIG_DIR=~/.claude` or when claudecodeui is pointed to `${CLAUDE_BASE_DIR}`).

## 2) CLI flags used by claudecodeui/happy-cli

**Official flags (excerpt from official `cli.js`):**
- `--session-id <uuid>`
- `-r, --resume [value]`
- `-c, --continue`
- `--fork-session`
- `--no-session-persistence` (print-only)
- `--output-format <text|json|stream-json>` (print-only; stream-json requires `--verbose`)
- `--input-format <text|stream-json>` (print-only)
- `--include-partial-messages` (print-only + stream-json)
- `--permission-prompt-tool <tool>` (print-only; supports `stdio`)
- `--system-prompt`, `--append-system-prompt`
- `--permission-mode`
- `--allowedTools`, `--disallowedTools`
- `--mcp-config`, `--strict-mcp-config`

**Frontend usage:**
- claudecodeui shell: `claude --resume <sessionId> || claude` (see `cc_official/claudecodeui/server/index.js`)
- happy-cli local: `--resume <sessionId>` or `--session-id <uuid>` plus `--append-system-prompt`, `--mcp-config`, `--allowedTools` (see `cc_official/happy-cli/src/claude/claudeLocal.ts`)
- happy-cli SDK mode: `--print` + `--output-format stream-json --verbose`, optionally `--input-format stream-json` + `--permission-prompt-tool stdio` (see `cc_official/happy-cli/src/claude/sdk/query.ts`)

**Kode status: PARTIAL/GAP**
- Kode has `--print`, `--safe`, `--verbose`, and `kode mcp ...`, but does not currently implement the Claude Code session flags nor stream-json I/O flags.

**Acceptance criteria:**
- Kode accepts and behaves compatibly for the above flags (at least the subset exercised by claudecodeui/happy-cli).

## 3) stream-json protocol (hard dependency for happy-cli SDK mode)

**Official behavior:**
- When `--print --output-format stream-json --verbose`, Claude prints newline-delimited JSON messages to stdout (and uses stdin for stream-json input/control when enabled).
- Output includes message types used by the Claude Code SDK:
  - `system` (e.g. status updates)
  - `user`
  - `assistant` (including tool_use blocks)
  - `result` (final summary/cost/usage)
  - `log`
  - `control_request`, `control_response`, `control_cancel_request` (permission + interrupt)

**Frontend expectation (happy-cli):**
- Reads stdout line-by-line as JSON; handles `control_request` (currently expects at least `can_use_tool`), and writes `control_response` to stdin (see `cc_official/happy-cli/src/claude/sdk/query.ts`).

**Kode status: GAP**
- No stream-json output mode; print mode returns only final text.

**Acceptance criteria:**
- Kode stream-json output matches the SDK message shapes used by happy-cli (`cc_official/happy-cli/src/claude/sdk/types.ts`).
- Optional: support `--input-format stream-json` and `control_request`/`control_response` roundtrip for stdio permission gating.

## 4) Tool schemas / aliases (required for “drop-in” parity)

**Official behavior (latest Claude Code):**
- `TaskOutput` tool is aliased as `AgentOutputTool` and `BashOutputTool` and has `userFacingName="Task Output"` (see official `cli.js` around `aliases:["AgentOutputTool","BashOutputTool"]`).

**Kode status: OK**
- Kode resolves aliases via `src/utils/toolNameAliases.ts` and implements `TaskOutput` schema compatible with official `bB7` schema.

**Acceptance criteria:**
- All tools used by the frontends (and the core Claude Code protocol) have matching names/schemas/prompts where relevant; alias resolution remains in place.

## 5) MCP CLI surface

**Frontend usage (claudecodeui):**
- Spawns `claude mcp ...` for list/add/get/remove etc (see `cc_official/claudecodeui/server/routes/mcp.js`).

**Kode status: PARTIAL**
- Kode supports `kode mcp ...` but subcommand surface/flags may diverge.

**Acceptance criteria:**
- Either: (A) Kode adds `claude mcp`-compatible subcommands/flags (aliases), or (B) claudecodeui gains a `kode` provider that calls `kode mcp ...` explicitly.

## Summary of highest-impact gaps (to unblock claudecodeui/happy)

1) Add JSONL session persistence at `${CLAUDE_BASE_DIR}/projects/...` (discover/resume).
2) Implement `--resume/--session-id/--continue/--fork-session` semantics on Kode.
3) Implement `--output-format stream-json` (and `--input-format stream-json` if permission control is needed).
4) Add `kode` provider in claudecodeui + happy-cli so they can spawn `kode` and/or point to `${CLAUDE_BASE_DIR}` cleanly without breaking existing Claude/Cursor paths.

