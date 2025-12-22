# Claude Code CLI Parity Audit (Kode CLI)

Truth source (runtime, obfuscated):
- `/Users/baicai/Desktop/MyT/Kode/Kode_CLI/cc_reverse/node_modules/@anthropic-ai/claude-code/cli.js`

This repo (Kode CLI):
- Workspace root: `/Users/baicai/Desktop/MyT/Kode/pr/Kode-cli`

## What was validated in this audit cycle

Items in `todo_tasks.json` were validated using targeted parity tests (unit + integration-style render tests) and direct string/function matching against the Claude Code truth source above.

Commands executed (final validation):
- `bun test` (246 tests; 238 pass, 8 skip; 0 fail)
- `bun run typecheck`
- `bun run build`
- `./cli.js --help`

Truth-source trace log (10+ keyword rounds; `rg` on `cli.js`):
- `# Tool usage policy` → 3976/3977（并行仅限独立工具；有依赖必须串行；禁止猜测/占位参数）。
- `shift+tab` → `ql` shortcut wiring (`hU.displayText:"shift+tab"` + `check:(..., key)=>key.tab&&key.shift`).
- `ctrl+b` / `ctrl+b ctrl+b` → `K41` overlay component (tmux-special hint).
- `SandboxedBash` / `CLAUDE_CODE_BASH_SANDBOX_SHOW_INDICATOR` → Bash tool `userFacingName(...)` gating (`hJA(...) && F0(env)`).
- `Waiting…` / `Running…` → queued/progress renderers (`ZJ2` queued, `GJ2` progress).
- `Command running in background with ID:` → `mapToolResultToToolResultBlockParam` background id suffix.
- `Network request outside of sandbox` / `Host:` / `Do you want to allow this connection?` → network permission renderer `dG9`.
- `background_shell_status` / `Has new output available...` → attachment renderer case.
- `SG1` → tool registry includes AskUserQuestion tool.
- `Answer questions?` → AskUserQuestion permission prompt string; tool has `renderToolUseMessage(){return null}` and `renderToolResultMessage(...)=>mA7`.
- `function mA7` → AskUserQuestion tool-result summary UI: `User answered Claude's questions:` and `· question → answer`.
- `type:\"input\"` → input-option pattern used by plan mode permission UI (`pc2`).
- `TodoWrite` → tool has `renderToolUseMessage/renderToolResultMessage` set to `null` (TodoWrite does not emit tool-use/result UI lines).
- `function zE9` → `/todos` command: empty state `No todos currently tracked`; else `${n} todo(s):` + `Ia` checkbox list.
- `allowUnixSockets` / `allowAllUnixSockets` → sandbox network config normalization (`YC1`).
- `yc0` / `vc0` / `p64` / `l64` / `i64` → sandbox network infra init: domain match + allow/deny/ask + internal HTTP/SOCKS proxies + macOS sandbox log monitor.
- `bash_extract_prefix` / `# Claude Code Code Bash command prefix detection` → 4158-4225（Bash prefix pre-flight spec + examples + “prefix must be a string prefix”）。

## Parity map (Claude Code → Kode implementation + tests)

### Input mode cycle (Shift+Tab / Alt+M)
- Claude Code: `ql` initializes `Tw6` + `hU` shortcut (Windows gating: Bun `>=1.2.23` else Node `>=22.17.0 <23 || >=24.2.0`)
- Kode: `src/utils/permissionModeCycleShortcut.ts`
- Tests: `src/test/unit/permission-mode-cycle-shortcut.test.ts`, `src/test/unit/promptinput-mode-cycle-intercept.test.ts`
- E2E: `src/test/e2e/tui-interactions.test.tsx`

### Permission mode cycle ordering + plan-mode side effects
- Claude Code: `aB9` (default → acceptEdits → plan → bypassPermissions? → default; dontAsk → default)
- Claude Code: mode-cycle handler sets plan exit flags and writes `lastPlanModeUse` when entering plan via cycle
- Kode: `src/types/PermissionMode.ts`, `src/context/PermissionContext.tsx`, `src/utils/planMode.ts`
- Tests: `src/test/unit/permission-mode-cycle.test.ts`

### Mode indicator UI
- Kode: `src/components/ModeIndicator.tsx`
- Tests: `src/test/unit/mode-indicator.test.ts`

### AskUserQuestion schema + result protocol
- Kode: `src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx`
- Tests:
  - `src/test/unit/ask-user-question-schema.test.ts`
  - `src/test/unit/ask-user-question-tool-ui.test.tsx`

### Tool-use UI suppression (Claude `renderToolUseMessage() => null`)
- Claude Code (truth): AskUserQuestion tool (`checkPermissions` message `"Answer questions?"`) sets `renderToolUseMessage(){return null}` and renders tool results via `mA7` (answers summary UI).
- Claude Code (truth): TodoWrite tool sets `renderToolUseMessage/renderToolResultMessage` to `null` (so TodoWrite produces no tool-use/result UI lines by default).
- Claude Code (truth): `/todos` command renders via `zE9`: empty → `No todos currently tracked`; non-empty → `${n} todo(s):` + `Ia` checkbox list.
- Kode: `src/Tool.ts` (allows null tool-use messages), `src/components/messages/AssistantToolUseMessage.tsx` (hides tool-use line when `userFacingName` is empty and tool message is null/empty).
- Tests: `src/test/unit/assistant-tool-use-message-null-render.test.tsx`

### AskUserQuestion permission UI (tabs, multi-select, Other input, IME enter-commit)
- Claude Code (truth): `SG1` → permission renderer `jp2` (question view `Mp2`, review view `Rp2`, reducer `dA7/Np2`), where `Other` is an input-option with placeholder (`"Type something"` / `"Type something."`) and IME enter-commit should be treated as text input (not selection).
- Kode: `src/components/permissions/AskUserQuestionPermissionRequest/AskUserQuestionPermissionRequest.tsx`
- Tests:
  - `src/test/unit/ask-user-question-permission-ui.test.ts`
  - `src/test/unit/ask-user-question-multiselect-nav.test.ts`
  - `src/test/unit/ask-user-question-other-textinput-filter.test.ts`
  - `src/test/unit/ask-user-question-single-select-nav.test.ts`
  - `src/test/unit/ask-user-question-trimmed-other-answer.test.ts`
- E2E: `src/test/e2e/tui-interactions.test.tsx`

### TodoWrite tool (schema + rendering)
- Claude Code (truth): TodoWrite tool returns `null` for tool-use/result renderers; todos are viewed via `/todos` (not via TodoWrite output).
- Kode:
  - Tool: `src/tools/TodoWriteTool/TodoWriteTool.tsx` (TodoWrite tool-use/result UI suppressed; errors throw to produce `tool_result.is_error=true`)
  - Render model: `src/utils/todoRenderModel.ts`
  - Command: `src/commands/todos.tsx`
- Tests:
  - `src/test/unit/todo-write-tool.test.ts`
  - `src/test/unit/todo-write-tool-render.test.ts`
  - `src/test/unit/todo-write-tool-ui.test.ts`
  - `src/test/unit/todos-command.test.tsx`

### Plan mode tools (EnterPlanMode / ExitPlanMode) + gating
- Kode: `src/tools/PlanModeTool/EnterPlanModeTool.tsx`, `src/tools/PlanModeTool/ExitPlanModeTool.tsx`
- Kode permission UI: `src/components/permissions/PlanModePermissionRequest/*`
- Tests:
  - `src/test/unit/enter-plan-mode-tool.test.ts`
  - `src/test/unit/exit-plan-mode-tool.test.ts`
  - `src/test/unit/exit-plan-mode-swarm-gating.test.ts`

### Task tool (subagents/background) + schema leniency (unknown keys)
- Kode: `src/tools/TaskTool/TaskTool.tsx`
- Tests: `src/test/unit/task-tool.test.ts`

### Tool scheduler (ToolUseQueue) concurrency, barriers, synthetic tool_result, queued Waiting…
- Kode: `src/query.ts`
- Tests: `src/test/unit/tool-scheduler-concurrency.test.ts`
- E2E: `src/test/e2e/tui-interactions.test.tsx`

### BashTool validateInput (no base-command hard deny)
- Claude Code (truth): BashTool validate path does not include a base-command denylist; safety is enforced via permissions + sandbox + path/xi rules.
- Kode: removed validateInput `BANNED_COMMANDS` hard gate in `src/tools/BashTool/BashTool.tsx`
- Tests: `src/test/unit/bash-tool-validate-input-no-banned-commands.test.ts`

### Tool-use-like blocks (`tool_use` / `server_tool_use` / `mcp_tool_use`)
- Kode: `src/query.ts`, `src/utils/messages.tsx`
- Tests: `src/test/unit/tool-use-like-blocks.test.ts`

### Claude `input_json_delta` incremental JSON parsing
- Kode: `src/utils/claudeToolUseJson.ts`
- Tests: `src/test/unit/claude-tool-use-json.test.ts`

### Messages normalization / reorder + REPL Static prefix (no duplicate replays)
- Kode: `src/utils/messages.tsx`, `src/screens/REPL.tsx`
- Tests:
  - `src/test/unit/messages-normalization-reorder.test.ts`
  - `src/test/unit/messages-ui-consistency.test.ts`
  - `src/test/unit/repl-static-split.test.ts`
  - `src/test/unit/repl-static-prefix-append-only.test.ts`

### Messages logs ↔ UI consistency (debug + invariants)
- Claude Code (truth): stream status machine `iBA(...)` (tracks `requesting`/`thinking`/`responding`/`tool-input`/`tool-use` and accumulates `input_json_delta` per tool block index).
- Claude Code (truth): messages stats `LX2/uE5` counts tool requests/results + flags duplicate `Read(file_path)` usage (`duplicateFileReads`).
- Kode:
  - Debug command: `src/commands/messages_debug.ts` (`/messages-debug`, enabled only under `--debug`/`--debug-verbose`) dumps in-memory messages + derived UI state + latest `~/.kode/<project>/messages/*.json`.
  - Logs path + naming: `src/utils/log.ts` (`CACHE_PATHS.messages()`; filenames are `${messageLogName}[-${forkNumber}][-sidechain-${n}].json`).
- How to trace duplicates:
  - Open `~/.kode/<sanitized-cwd>/messages/<latest>.json` and scan assistant `tool_use` blocks (id/name/input) and user `tool_result` blocks (tool_use_id).
  - Compare with `/messages-debug` → `orderedMessages` + `toolUseSummary`; note that logs intentionally omit `progress` messages, so only compare `tool_use` / `tool_result` sequencing.
- Tests: `src/test/unit/messages-ui-consistency.test.ts`

### Permissions (filesystem/bash/web) + toolPermissionContext model + multi-source settings merge/persist
- Kode: `src/permissions.ts`, `src/utils/permissions/*`, `src/kode-types/toolPermissionContext.ts`, `src/utils/toolPermissionContextState.ts`, `src/utils/config.ts`
- Tests:
  - `src/test/unit/tool-permission-context.test.ts`
  - `src/test/unit/tool-permission-settings.test.ts`
  - `src/test/unit/file-permission-engine.test.ts`

### Sandbox network infra (macOS HTTP/SOCKS proxy, allow/deny/ask)
- Claude Code (truth): `yc0/vc0/p64/l64/i64` (domain matching + internal proxy servers + fail-closed init).
- Kode:
  - Runtime infra: `src/utils/sandboxNetworkInfrastructure.ts`
  - BashTool wiring (auto-start proxies when sandboxed on macOS): `src/tools/BashTool/BashTool.tsx`
- Tests:
  - `src/test/unit/sandbox-network-infrastructure.test.ts`
  - `src/test/integration/sandbox-network-macos-proxy.test.ts`
  - `src/test/unit/bash-permission-engine.test.ts`
  - `src/test/unit/bash-sandbox-permission-matrix.test.ts`
  - `src/test/unit/web-permission-rules.test.ts`

### Sandbox (config normalization + Linux bwrap enforcement) + Bash progress
- Kode: `src/utils/sandboxConfig.ts`, `src/utils/BunShell.ts`, `src/tools/BashTool/BashTool.tsx`
- Tests:
  - `src/test/unit/sandbox-config.test.ts`
  - `src/test/unit/bun-shell-sandbox-bwrap.test.ts`
  - `src/test/unit/bun-shell-ampersand-hang.test.ts`
  - `src/test/unit/bash-tool-progress.test.ts`

### Bash foreground → background promotion core (ctrl+b plumbing)
- Claude Code (truth): `gH5` (progress generator) + `yoA` (shell spawn) + `xrA` (timeout/abort + `background()` that clears guards and returns stdout/stderr streams) + `Tt1/UQ5` (background task registration + 6-char id).
- Claude Code (truth): `K41` (ctrl+b hint; tmux uses `ctrl+b ctrl+b`) + `mapToolResultToToolResultBlockParam` appends `Command running in background with ID: ${backgroundTaskId}`.
- Kode:
  - `src/utils/BunShell.ts` (`execPromotable()` + `background()` promotion)
  - `src/utils/BunShell.ts` (`execInBackground()` uses `makeBackgroundTaskId()` like Claude `UQ5`)
  - `src/tools/BashTool/BashTool.tsx` (shows ctrl+b overlay after 2s via `setToolJSX` + returns `backgroundTaskId`)
  - `src/tools/BashTool/BashToolRunInBackgroundOverlay.tsx` (Ink `useInput` ctrl+b handler + hint string)
- Tests:
  - `src/test/unit/bun-shell-promote-to-background.test.ts`
  - `src/test/unit/bash-tool-ctrl-b-background.test.ts`
  - `src/test/tools/tools-basic.test.ts` (execInBackground id format + BashOutput/KillShell flow)
- E2E: `src/test/e2e/tui-interactions.test.tsx`

### Background bash status attachments (background_shell_status)
- Claude Code (truth): `PC5(... attachments ...)` includes `background_shells` → `Bz5(...)` returning `background_shell_status` objects.
- Claude Code (truth): attachment rendering switch/case `background_shell_status` formats: `Background Bash <id> (command: <cmd>) (status: <...>) (exit code: <...>)` and appends `Has new output available. You can check its output using the BashOutput tool.` when `hasNewOutput`.
- Kode:
  - `src/utils/BunShell.ts` (`flushBackgroundShellStatusAttachments()` + `renderBackgroundShellStatusAttachment()`)
  - `src/query.ts` (injects synthetic `<tool-progress>...</tool-progress>` messages before model call so the model can decide when to use `BashOutput`)
- Tests:
  - `src/test/unit/background-shell-status-attachments.test.ts`

### Bash notifications (bash-notification)
- Claude Code (truth): `Tt1` registers a shell background task with fields `completionStatusSentInAttachment` + `notified`; on completion/kill it calls `Rt1` which emits a `<bash-notification>` queued command containing:
  - `<shell-id>...</shell-id>` + `<status>completed|failed|killed</status>` + `<summary>Background command \"...\" ...</summary>`
  - `Use BashOutput with bash_id=\"...\" to retrieve the output.`
  - then sets `backgroundTasks[id].notified=true` (so `Bz5/d12` won’t emit a duplicate completion attachment).
- Kode:
  - `src/utils/BunShell.ts` (`flushBashNotifications()` + `renderBashNotification()`; marks `BackgroundProcess.notified=true` once flushed)
  - `src/query.ts` (injects `<bash-notification>...</bash-notification>` synthetic assistant messages before `background_shell_status` attachments)
  - `src/components/messages/AssistantTextMessage.tsx` (renders `<bash-notification>` as a concise system line instead of raw XML)
- Tests: `src/test/unit/bash-notification.test.ts`

### Bash read-only detection (isReadOnly) + concurrency safe
- Claude Code (truth): Bash tool defines `isConcurrencySafe(input){ return this.isReadOnly(input) }`.
- Claude Code (truth): read-only classifier `l02(...)` requires parse success, `xi(command).behavior === 'passthrough'`, splits into segments via `zF(...)`, and requires each segment to pass `A25(...)` allowlist check; `A25(...)` trims trailing ` 2>&1`, blocks dangerous git flags (`-c`, `--exec-path`, `--config-env`), and matches allowlist regex set `tB5=...`.
- Kode:
  - `src/utils/permissions/bashReadOnly.ts` (`isBashCommandReadOnly()`; conservative: forbids pipes/&&/;/redirections and requires a single passthrough subcommand)
  - `src/tools/BashTool/BashTool.tsx` (input-aware `isReadOnly` + `isConcurrencySafe === isReadOnly`)
  - `src/Tool.ts` (input-aware `isReadOnly` signature) + call sites in `src/permissions.ts` and `src/components/permissions/FilesystemPermissionRequest/FilesystemPermissionRequest.tsx`
- Tests: `src/test/unit/bash-readonly-and-concurrency.test.ts`

### Bash tool prompt + description parity (eRB/Gq6/Zq6/Bq6)
- Claude Code (truth): `eRB()` (Bash tool prompt), `Gq6()` (sandbox guidance), `Zq6()` (git/PR guidance), `Bq6()` (attribution strings), and Bash tool `description({description}) => description || "Run shell command"`.
- Kode:
  - Prompt string builder: `src/tools/BashTool/prompt.ts` (`getBashToolPrompt()` + sandbox/git sections).
  - Per-call description: `src/tools/BashTool/BashTool.tsx` (`cachedDescription: "Run shell command"` + `description(input)` uses `input.description`).
  - Tool-result join behavior: `src/tools/BashTool/BashTool.tsx` (`renderResultForAssistant` joins stdout/stderr/background id like Claude’s `mapToolResultToToolResultBlockParam`).
- Tests: `src/test/unit/tool-prompts-schema-parity.test.ts`

### System prompt tool usage policy (dependency-aware parallelism)
- Claude Code (truth): `# Tool usage policy` line 3976 includes “no dependencies → parallel; has dependencies → sequential; never guess placeholders”.
- Kode: `src/constants/prompts.ts`
- Tests: `src/test/unit/system-prompt-tool-usage-policy.test.ts`

### Bash prefix pre-flight prompt/spec (permission UI commandPrefix)
- Claude Code (truth): `bash_extract_prefix` prompt spec at 4158-4225 (potion/npm run lint/sleep/env-var prefixes + “prefix must be a string prefix”).
- Kode: `src/utils/commands.ts` (`buildBashCommandPrefixDetectionPrompt`)
- Tests: `src/test/unit/bash-command-prefix-prompt-parity.test.ts`

### Session message logs (path + compatibility)
- Kode: `src/utils/log.ts`
- Tests: `src/test/unit/log-paths-compat.test.ts`
- Manual trace: `~/.kode/-Users-baicai-Desktop-MyT-Kode-pr-Kode-cli/messages/2025-12-20T10-27-35-379Z.json` shows `Bash(run_in_background)` → `Bash(sleep 5)` → `BashOutput` + `KillShell` using the same returned id (no placeholder/guessed ids).
