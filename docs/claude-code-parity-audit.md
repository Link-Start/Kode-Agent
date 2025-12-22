# Kode CLI ↔ Claude Code CLI Parity Audit

Truth source(s) referenced during this alignment:
- `/Users/baicai/Desktop/MyT/Kode/Kode_CLI/cc_reverse/node_modules/@anthropic-ai/claude-code/cli.js`
- `/Users/baicai/Desktop/MyT/Kode/Kode_CLI/Claude_Code_Agent_Tool_System_final`

This document summarizes the implemented 1:1 parity surfaces and where to find the Kode-side implementation + tests that lock behavior.

## Keyboard / Mode UI

- **Shift+Tab / Alt+M permission-mode cycling shortcut**
  - Claude Code: `hU` shortcut init/check (in `cli.js`)
  - Kode: `src/utils/permissionModeCycleShortcut.ts`
  - Tests: `src/test/unit/permission-mode-cycle-shortcut.test.ts`

- **Permission mode cycle ordering + side-effects**
  - Claude Code: `aB9` (mode cycle + plan enter/exit side-effects)
  - Kode: `src/types/PermissionMode.ts`, `src/context/PermissionContext.tsx`, `src/utils/planMode.ts`, `src/utils/permissionModeState.ts`
  - Tests: `src/test/unit/permission-mode-cycle.test.ts`

- **ModeIndicator UI parity**
  - Claude Code: mode indicator rendering logic (in `cli.js`)
  - Kode: `src/components/ModeIndicator.tsx`
  - Tests: `src/test/unit/mode-indicator.test.ts`

- **PromptInput key-intercept precedence (Tab vs Shift+Tab)**
  - Claude Code: input handler branch where shortcut triggers and prevents character insert (in `cli.js`)
  - Kode: `src/components/PromptInput.tsx`, `src/utils/promptInputSpecialKey.ts`
  - Tests: `src/test/unit/promptinput-mode-cycle-intercept.test.ts`

## Tool UI + Tool Protocol Parity

- **AskUserQuestion schema + UI behavior**
  - Claude Code: AskUserQuestion input/output structures + elicitation flow (in `cli.js` + `sdk-tools.d.ts`)
  - Kode: `src/tools/AskUserQuestionTool/AskUserQuestionTool.tsx`
  - Tests: `src/test/unit/ask-user-question-schema.test.ts`, `src/test/unit/ask-user-question-permission-ui.test.ts`

- **TodoWrite schema + rendering parity**
  - Claude Code: TodoWrite semantics + render formatting (in `cli.js`)
  - Kode: `src/tools/TodoWriteTool/TodoWriteTool.tsx`, `src/utils/todoStorage.ts`
  - Tests: `src/test/unit/todo-write-tool.test.ts`, `src/test/unit/todo-write-tool-render.test.ts`

- **Plan mode tools (Enter/Exit)**
  - Claude Code: EnterPlanMode / ExitPlanMode tool definitions + permission UI (in `cli.js`)
  - Kode: `src/tools/PlanModeTool/EnterPlanModeTool.tsx`, `src/tools/PlanModeTool/ExitPlanModeTool.tsx`
  - Tests: `src/test/unit/enter-plan-mode-tool.test.ts`, `src/test/unit/exit-plan-mode-tool.test.ts`, `src/test/unit/exit-plan-mode-swarm-gating.test.ts`

- **Task tool (subagent / background)**
  - Claude Code: Task tool schema + run_in_background/resume transcript behavior (in `cli.js`)
  - Kode: `src/tools/TaskTool/TaskTool.tsx`, `src/utils/agentTranscripts.ts`, `src/utils/backgroundTasks.ts`
  - Tests: `src/test/unit/task-tool.test.ts`

## Messages / Model Protocol

- **Message normalization + tool block ordering**
  - Claude Code: message reordering and progress/tool_result placement rules (in `cli.js`)
  - Kode: `src/utils/messages.tsx`, `src/utils/messageContextManager.ts`
  - Tests: `src/test/unit/messages-normalization-reorder.test.ts`, `src/test/unit/tool-use-like-blocks.test.ts`

- **Claude tool_use JSON streaming delta robustness**
  - Claude Code: partial JSON deltas closure rules (in `cli.js`)
  - Kode: `src/utils/claudeToolUseJson.ts`
  - Tests: `src/test/unit/claude-tool-use-json.test.ts`

## Permissions (Filesystem / Bash / Web)

- **Filesystem rule engine, symlink + plan file safety**
  - Claude Code: filesystem permission matching + suggestions (in `cli.js`)
  - Kode: `src/utils/permissions/fileToolPermissionEngine.ts`, `src/permissions.ts`
  - Tests: `src/test/unit/file-permission-engine.test.ts`

- **Bash permission engine (command injection + rule precedence)**
  - Claude Code: `We1` (Bash checkPermissions) + helpers including `xi`, `nB5` (autoAllow with sandbox)
  - Kode: `src/utils/permissions/bashToolPermissionEngine.ts`, `src/permissions.ts`
  - Tests: `src/test/unit/bash-permission-engine.test.ts`, `src/test/unit/bash-sandbox-permission-matrix.test.ts`

- **WebFetch/WebSearch permission key/rules**
  - Claude Code: `UA7` (WebFetch key normalization)
  - Kode: `src/permissions.ts`
  - Tests: `src/test/unit/web-permission-rules.test.ts`

## Sandbox (Settings → Runtime Config → bwrap)

- **Settings→runtime normalization + hot updates + Linux glob warnings**
  - Claude Code: `YC1(settings)` (normalize) + `z34()` (glob warnings) + `JB` manager (settings subscription)
  - Kode: `src/utils/sandboxConfig.ts` (merge + normalize + watcher), `src/test/unit/sandbox-config.test.ts`

- **Linux bwrap argument generation**
  - Claude Code: `x64()` (filesystem args) + `Nc0()` (wrap command) in `cli.js`
  - Kode: `src/utils/BunShell.ts` (`buildLinuxBwrapFilesystemArgs`, `buildLinuxBwrapCommand`)
  - Tests: `src/test/unit/bun-shell-sandbox-bwrap.test.ts`

- **Sandbox ↔ Bash/Grep execution + permission matrix**
  - Claude Code: `JB.wrapWithSandbox(...)` integration + `autoAllowBashIfSandboxed` (`nB5`) + `allowUnsandboxedCommands` gating
  - Kode: `src/utils/claudeSandbox.ts`, `src/permissions.ts`, `src/tools/BashTool/BashTool.tsx`, `src/utils/ripgrep.ts`, `src/tools/GrepTool/GrepTool.tsx`
  - Tests: `src/test/unit/bash-sandbox-permission-matrix.test.ts`

## Regression Checklist (required by T025)

- Tests: `bun test`
- Types: `bun run typecheck`
- Build: `bun run build`

