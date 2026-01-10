# Kode CLI vs Claude Code 工具系统对齐证据（V3）

> ⚠️ 说明：V3 为阶段性证据清单；后续已完成多项对齐并补充了更严格的“只基于可复核证据”的汇总。当前仓库最新状态请以 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md` 为准。

本文件仅列出**已找到明确原文证据**的差异点；每条均给出 Kode 源码与官方 cli.js / sdk-tools.d.ts 的原文引用与行号。

## 证据来源
- Kode 源码：`packages/**` 与 `apps/**`。
- 官方：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js` 与 `sdk-tools.d.ts`。

## 系统提示词与前缀

1) **系统提示词文本不一致（风格与限制）**
- Kode 原文（强制“少于 4 行”）：
  - `packages/core/src/constants/prompts.ts:66-73`
  - > `IMPORTANT: Keep your responses short... You MUST answer concisely with fewer than 4 lines ...`
- 官方原文（包含“NEVER create files”与“Professional objectivity”）：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4315-4322`
  - > `- NEVER create files unless they're absolutely necessary...`
  - > `# Professional objectivity`
  - > `Prioritize technical accuracy and truthfulness over validating the user's beliefs...`

2) **System prompt 前缀不一致**
- Kode 前缀：
  - `packages/core/src/constants/prompts.ts:14-15`
  - > `You are ${PRODUCT_NAME}, ShareAI-lab's Agent AI CLI for terminal & coding.`
- 官方前缀集合：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:562`
  - > `mn1="You are Claude Code, Anthropic's official CLI for Claude."`

## 工具 schema / prompt / 行为差异（证据版）

### 文件工具
1) **Read prompt：官方含 PDF 说明，Kode 未含**
- Kode：
  - `packages/tools/src/tools/filesystem/FileReadTool/prompt.ts:6-17`
  - > `Reads a file from the local filesystem...`
  - > `- This tool allows reading images...`
  - > `- This tool can read Jupyter notebooks (.ipynb files)...`
- 官方（firstParty 条件下追加 PDF 说明）：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495-505`
  - > `- This tool allows Claude Code to read images ...`
  - > `- This tool can read PDF files (.pdf). PDFs are processed page by page...`

2) **Read PDF 最大体积限制不同**
- Kode（10MB）：
  - `packages/tools/src/tools/filesystem/FileReadTool/call.ts:84-88`
  - > `maxFileSize: 10 * 1024 * 1024,`
- 官方（32MB）：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495`
  - > `PDF file size (...) exceeds maximum allowed size (...) PDF files must be less than 32MB.`

3) **Write 输出缺 originalFile**
- Kode 输出类型：
  - `packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:191-198`
  - > `type: 'create' | 'update' ... structuredPatch: Hunk[]`
- 官方输出包含 originalFile：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1265`
  - > `... structuredPatch:E,originalFile:V ...`

4) **Edit 输出缺 userModified/replaceAll**
- Kode 输出类型：
  - `packages/tools/src/tools/filesystem/FileEditTool/FileEditTool.tsx:258-265`
  - > `filePath, oldString, newString, originalFile, structuredPatch`
- 官方输出 schema：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1246`
  - > `... structuredPatch ... userModified ... replaceAll ...`

### 任务/系统工具
5) **Bash 输出 schema 字段缺失**
- Kode 输出类型：
  - `packages/tools/src/tools/system/BashTool/BashTool.tsx:56-64`
  - > `stdout, stdoutLines, stderr, stderrLines, interrupted, bashId?, backgroundTaskId?`
- 官方输出 schema：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3489`
  - > `... summary ... rawOutputPath ... interrupted ... isImage ... structuredContent ...`

6) **Bash prompt：TMPDIR 与署名不一致**
- Kode TMPDIR 指令：
  - `packages/tools/src/tools/system/BashTool/prompt.ts:115-121`
  - > `- IMPORTANT: For temporary files, rely on ... TMPDIR ...`
- 官方 TMPDIR 指令：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2745-2748`
  - > `- IMPORTANT: For temporary files, use /tmp/claude/...`
  - > `- The TMPDIR environment variable is automatically set to /tmp/claude ...`
- Kode commit 署名：
  - `packages/tools/src/tools/system/BashTool/prompt.ts:11-35`
  - > `🤖 Generated with [Kode Agent](https://github.com/shareAI-lab/kode)`
  - > `Co-Authored-By: ShareAI Lab <ai-lab@foxmail.com>`
- 官方 commit 署名：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2712`
  - > `🤖 Generated with [Claude Code](...)`

7) **Task prompt 差异（背景任务/恢复说明）**
- Kode prompt（包含 slash command 说明）：
  - `packages/tools/src/tools/ai/TaskTool/prompt.ts:44-49`
  - > `When to use the Agent tool: ... slash commands ...`
- 官方 prompt（背景/恢复说明）：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1296-1303`
  - > `You can optionally run agents in the background ... use TaskOutput ...`
  - > `Agents can be resumed using the resume parameter ...`

8) **TaskOutput 输入兼容字段差异**
- Kode 兼容 agentId/bash_id/wait_up_to：
  - `packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:50-64`
  - > `task_id = ... agentId ... bash_id ...`
  - > `timeout = ... wait_up_to ...`
- 官方 input schema 仅 task_id/block/timeout：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:90-102`
  - > `task_id: string; block?: boolean; timeout?: number;`

9) **ExitPlanMode 输入扩展**
- Kode：
  - `packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:27-37`
  - > `launchSwarm ... teammateCount ...`
- 官方：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:104-106`
  - > `export interface ExitPlanModeInput { [k: string]: unknown; }`

10) **AskUserQuestion 输入扩展**
- Kode：
  - `packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:21-26`
  - > `questions ... answers?: ...`
- 官方：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:294-301`
  - > `questions: ...`

11) **TodoWrite 输出扩展**
- Kode 输出包含 agentId：
  - `packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:42-47`
  - > `oldTodos ... newTodos ... agentId?`
- 官方输出 schema 仅 oldTodos/newTodos：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:839`
  - > `d63=m.object({oldTodos...,newTodos...})`

### 网络与 MCP
12) **WebSearch 实现路径不同**
- Kode：DuckDuckGo 本地抓取
  - `packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx:152-155`
  - > `const rawResults = await searchProviders.duckduckgo.search(query)`
- 官方：server tool
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2901`
  - > `type:"web_search_20250305"...`

13) **WebFetch 权限检查不同**
- Kode：仅 needsPermissions，无 checkPermissions
  - `packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:57-59`
  - > `needsPermissions() { return true }`
- 官方：显式 checkPermissions + 允许域列表
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2309`
  - > `async checkPermissions(...) { ... for (let H of RI1) ... }`

14) **MCP 工具 prompt 为空**
- Kode：
  - `packages/tools/src/tools/mcp/MCPTool/prompt.ts:1-3`
  - > `PROMPT = ''`
- 官方：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2947-2954`
  - > `You MUST use this tool to load MCP tools BEFORE calling them directly...`

### 工具集合
15) **官方 ToolInputSchemas 列表不包含 Kode-only 工具**
- Kode registry 包含 AskExpertModel/SlashCommand/Skill 等：
  - `packages/tools/src/registry.ts:4-55`
  - > `AskExpertModelTool ... SlashCommandTool ... SkillTool ...`
- 官方 ToolInputSchemas 列表：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`
  - > `... BashInput ... TodoWriteInput ... AskUserQuestionInput;`

## 请求元信息差异（UA / headers / timeout）

1) **User-Agent 不一致**
- Kode UA：
  - `packages/core/src/utils/http.ts:8`
  - > `export const USER_AGENT = ...`
- 官方 UA：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:237`
  - > `claude-cli/${VERSION} (external, ...)`

2) **Anthropic 默认 headers 与 timeout 不一致**
- Kode headers/timeout：
  - `packages/core/src/ai/llm/anthropic/client.ts:43-56`
  - > `'x-app': 'cli' ... 'User-Agent': USER_AGENT`
  - > `timeout: ... 60 * 1000`
- 官方 headers/timeout：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1006`
  - > `defaultHeaders: { "x-app":"cli", "User-Agent":Yi(), ... }`
  - > `timeout: ... 600000`

## 模型连接测试差异

1) **当前仅“YES”文本验证，不覆盖工具调用**
- Kode：
  - `apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:30-42`
  - > `messages: [{ role: 'user', content: 'Please respond with exactly "YES"...' }]`
  - > `temperature: 0`

## 结论（证据版）
以上差异均有明确原文证据，说明当前 Kode CLI 工具系统、系统提示词与请求元信息**未实现 100% 官方对齐**。
