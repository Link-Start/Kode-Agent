# Kode CLI vs Claude Code 工具对齐分析（证据版）

> ⚠️ 说明：本文件为早期对齐分析（会包含当时的差异结论）。当前仓库的最新“可复核证据状态”请以 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md` 为准；对齐/回退方案计划请以 `KODE_CLAUDE_TOOL_ALIGNMENT_PLAN.md` 与 `KODE_CLAUDE_TOOL_ALIGNMENT_AND_FALLBACK_PLAN.md` 为准。

## 范围与证据
- Kode 工具注册与定义来源：`packages/tools/src/registry.ts:1-55`。
- Kode 系统提示词：`packages/core/src/constants/prompts.ts:14-171`；Kode agent prompt：`packages/core/src/constants/prompts.ts:185-193`。
- 官方工具与提示词来源：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4295-4416`。
- 官方输入 schema 列表：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`。

## 工具清单与官方可见性
- Kode registry 列出：Task、AskExpertModel、Bash、TaskOutput、KillShell、Glob、Grep、LSP、Read/Edit/Write/NotebookEdit、TodoWrite、WebSearch/WebFetch、AskUserQuestion、Enter/ExitPlanMode、SlashCommand、Skill、List/ReadMcpResource、MCP 等（`packages/tools/src/registry.ts:4-55`）。
- 官方 sdk-tools 输入列表包含：Agent(Task)、Bash、TaskOutput、ExitPlanMode、FileEdit/Read/Write、Glob/Grep、KillShell、ListMcpResources、Mcp、NotebookEdit、ReadMcpResource、TodoWrite、WebFetch/WebSearch、AskUserQuestion（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。
- 官方 cli.js 中存在 LSP 工具定义（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2927-2945`）与 EnterPlanMode 工具定义（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2475`），但 sdk-tools 输入列表未列出（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。

## 系统提示词差异（关键指令不一致）
- Kode 系统提示词包含“回答少于 4 行”的硬性限制与示例（`packages/core/src/constants/prompts.ts:66-103`）。
- 官方系统提示词包含 Professional objectivity 与 Planning without timelines（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4315-4325`），并要求“NEVER create files unless they're absolutely necessary”（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4319`）。
- Kode agent prompt 强制“返回绝对路径”（`packages/core/src/constants/prompts.ts:185-193`），官方系统提示词要求使用 `file_path:line_number` 格式引用代码（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4420-4423`）。
- Kode 系统提示词要求完成任务后必须运行 lint/typecheck（`packages/core/src/constants/prompts.ts:146-147`），官方系统提示词的“Doing tasks”部分未包含该硬性要求，且工具使用策略不同（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4382-4406`）。

## 工具级对齐分析

### 文件/搜索类
- Read（文件读取）：
  - Kode prompt 列出图像与 ipynb 支持（`packages/tools/src/tools/filesystem/FileReadTool/prompt.ts:15-17`），官方 prompt 在 firstParty 情况下追加 PDF 支持说明（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:504-505`）。
  - Kode PDF 读取最大 10MB（`packages/tools/src/tools/filesystem/FileReadTool/call.ts:84-88`），官方 PDF 最大 32MB（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495`）。
- Write（文件写入）：
  - Kode 输出数据不含 originalFile 字段（`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:147-166`；`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:191-198`）。
  - 官方输出 schema 与返回数据包含 originalFile（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1263`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1265`）。
- Edit（文件编辑）：
  - Kode 输出 schema 仅含 filePath/oldString/newString/originalFile/structuredPatch（`packages/tools/src/tools/filesystem/FileEditTool/FileEditTool.tsx:232-265`）。
  - 官方输出 schema 额外包含 userModified 与 replaceAll（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1246`）。
- NotebookEdit：
  - Kode prompt 与官方 prompt 文本一致（`packages/tools/src/tools/filesystem/NotebookEditTool/prompt.ts:1-3`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1874`）。
  - Kode 与官方输入 schema 使用一致字段（`packages/tools/src/tools/filesystem/NotebookEditTool/NotebookEditTool.tsx:27-52`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1874`）。
- Glob / Grep：
  - Kode prompt 与官方 prompt 对齐（`packages/tools/src/tools/filesystem/GlobTool/prompt.ts:3-8`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:515-519`；`packages/tools/src/tools/search/GrepTool/prompt.ts:3-12`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:520-528`）。

### 执行/任务类
- Bash：
  - Kode 输出仅含 stdout/stderr/lines/interrupt 等（`packages/tools/src/tools/system/BashTool/BashTool.tsx:56-64`），官方输出 schema 还包含 summary/rawOutputPath/isImage/structuredContent 等（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3489`）。
  - Kode sandbox prompt 使用 TMPDIR（`packages/tools/src/tools/system/BashTool/prompt.ts:115-121`），官方 prompt 使用 `/tmp/claude/`（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2745-2748`）。
  - Kode git 提交署名为 Kode/ShareAI（`packages/tools/src/tools/system/BashTool/prompt.ts:11-36`），官方为 Claude Code/Anthropic（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2712`）。
  - Kode 在 validateInput 中强制限制 agent 模式下 cd 只能进入原始目录子路径（`packages/tools/src/tools/system/BashTool/BashTool.tsx:148-169`），官方 prompt 仅要求尽量避免 cd（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2787-2793`）。
- Task：
  - Kode prompt 强调 slash command 与 agent 列表（`packages/tools/src/tools/ai/TaskTool/prompt.ts:36-55`），官方 prompt 额外强调 background/resume/parallel 细节（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1296-1305`）。
  - Kode completed 输出 schema 中 usage 为 unknown（`packages/tools/src/tools/ai/TaskTool/schema.ts:35-51`），官方 outputSchema 明确 usage 结构（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2880`）。
- TaskOutput：
  - 输入 schema 对齐（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:12-25`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:90-102`）。
  - Kode 额外兼容 agentId/bash_id/wait_up_to（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:50-65`），官方 schema 不含这些字段（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:90-102`）。
  - 官方 TaskOutput 工具定义带 aliases（AgentOutputTool/BashOutputTool）（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2891`），Kode TaskOutput 工具定义中未出现 aliases 字段（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:129-151`）。
- KillShell：
  - Kode prompt 与官方 prompt 内容一致（`packages/tools/src/tools/system/KillShellTool/prompt.ts:5-9`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2886-2890`）。
- LSP：
  - Kode prompt 与官方 prompt 对齐（`packages/tools/src/tools/system/LspTool/prompt.ts:3-21`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2927-2945`）。
  - Kode 输入/输出 schema 与官方定义一致（`packages/tools/src/tools/system/LspTool/LspTool.tsx:17-50`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2927-2945`）。
  - sdk-tools 输入列表未列出 LSP（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。

### 计划/交互类
- EnterPlanMode：
  - Kode prompt 与官方 prompt 对齐（`packages/tools/src/tools/interaction/PlanModeTool/prompt.ts:7-91`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2391-2440`）。
  - 官方 cli.js 中存在 EnterPlanMode 工具定义（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2475`），但 sdk-tools 输入列表未列出（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。
- ExitPlanMode：
  - Kode inputSchema 增加 launchSwarm/teammateCount（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:27-37`），官方 ExitPlanModeInput 为空对象（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:104-106`）。
  - Kode 结果说明包含 swarm/teammate 相关指令（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:143-185`），官方结果消息仅包含 plan 审批文本（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2370-2387`）。
- AskUserQuestion：
  - Kode inputSchema 额外允许 answers 字段（`packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:21-27`），官方 AskUserQuestionInput 仅含 questions（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:294-419`）。
  - prompt 文本一致（`packages/tools/src/tools/interaction/AskUserQuestionTool/prompt.ts:5-14`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2318-2327`）。
- TodoWrite：
  - prompt 文本一致（`packages/tools/src/tools/interaction/TodoWriteTool/prompt.ts:1-186`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:647-720`）。
  - Kode output 包含 agentId（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:42-47`），官方 outputSchema 仅 oldTodos/newTodos（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:829-839`）。
  - Kode 使用 todoStorage/本地持久化（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:5-15`），官方 call 直接写入 app state todos（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:829-839`）。
- SlashCommand / Skill / AskExpertModel：
  - 这些工具存在于 Kode registry（`packages/tools/src/registry.ts:4-54`）及其实现（`packages/tools/src/tools/interaction/SlashCommandTool/SlashCommandTool.tsx:14-110`；`packages/tools/src/tools/interaction/SkillTool/SkillTool.tsx:6-113`；`packages/tools/src/tools/ai/AskExpertModelTool/AskExpertModelTool.tsx:12-35`），但官方 sdk-tools 输入列表中不存在（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。

### 网络/MCP
- WebSearch：
  - prompt 文本一致（`packages/tools/src/tools/search/WebSearchTool/prompt.ts:11-36`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:537-561`）。
  - Kode 通过 DuckDuckGo 本地检索（`packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx:152-178`），官方使用 server tool `web_search_20250305`（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2901`）。
- WebFetch：
  - prompt 文本一致（`packages/tools/src/tools/network/WebFetchTool/prompt.ts:2-18`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:478-494`）。
  - 官方 WebFetch 定义包含 checkPermissions 与预置允许域列表（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2309`），Kode WebFetchTool 定义中未实现 checkPermissions，仅声明 needsPermissions=true（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:41-61`）。
- MCP：
  - Kode MCPTool prompt 为空（`packages/tools/src/tools/mcp/MCPTool/prompt.ts:1-3`）。
  - 官方 MCP 工具 prompt 明确“必须先加载 MCP 工具”并给出查询模式（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2947-2965`）。
- ListMcpResources / ReadMcpResource：
  - Kode 与官方均有对应工具与 schema（`packages/tools/src/tools/mcp/ListMcpResourcesTool/ListMcpResourcesTool.tsx:9-14`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1134`；`packages/tools/src/tools/mcp/ReadMcpResourceTool/ReadMcpResourceTool.tsx:9-12`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1147`）。

## 结论
- 基于以上证据，Kode CLI 与官方 Claude Code 在系统提示词、部分工具 schema 与内部行为上存在多处不对齐（如 FileWrite/FileEdit/Bash/Task/ExitPlanMode/WebSearch/MCP 等）。
- 同时也存在 prompt/输入 schema 明显对齐的工具（如 Glob/Grep/NotebookEdit/AskUserQuestion/TaskOutput/EnterPlanMode/WebFetch 等），但仍需关注输出字段与行为差异。
