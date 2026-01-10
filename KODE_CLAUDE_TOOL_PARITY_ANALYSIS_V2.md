# Kode CLI vs Claude Code 工具系统与请求元信息对齐复核（V2，证据版）

> ⚠️ 说明：V2 为阶段性复核结论；后续已完成多项对齐（含 Claude Code headers/system/tools 多级回退、连接测试的真实 tool-use 验证等）。当前仓库最新“可复核证据状态”请以 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md` 为准。

## 范围与证据来源
- Kode 工具注册与默认工具列表：`packages/tools/src/registry.ts:1-55`。
- Kode 系统提示词与 Agent prompt：`packages/core/src/constants/prompts.ts:14-171`、`packages/core/src/constants/prompts.ts:185-193`。
- Kode system prompt 构建与注入路径：`packages/core/src/engine/systemPrompt.ts:11-39`、`packages/core/src/engine/message-pipeline.ts:188-265`。
- Kode system prompt prefix 与注入：`packages/core/src/constants/prompts.ts:14-16`、`packages/core/src/ai/llm/anthropic/native.ts:158-170`、`packages/core/src/ai/llm/openai/queryOpenAI.ts:97-102`。
- Kode Anthropic 请求默认头：`packages/core/src/ai/llm/anthropic/client.ts:43-56`、`packages/core/src/ai/llm/anthropic/native.ts:123-132`。
- Kode OpenAI 兼容请求头：`packages/core/src/ai/openai/completion.ts:130-142`。
- Kode User-Agent 生成：`packages/core/src/utils/http.ts:8`。
- Kode 模型连接测试 UI/流程：`apps/cli/src/ui/ui/components/model-selector/screens/ConnectionTestScreen.tsx:18-119`、`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/runConnectionTestFlow.ts:17-26`、`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/performConnectionTest.ts:11-127`、`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:30-134`、`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testProviderSpecificEndpoint.ts:15-67`、`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/types.ts:3-8`。
- 官方 Claude Code system prompt：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4295-4416`。
- 官方工具输入 schema 列表：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`。
- 官方 UA 生成与请求默认头：`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:237`、`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1006`。

## 结论（仅基于证据）
- **工具系统未 100% 对齐**：多处 schema/prompt/行为差异仍存在（详见“工具级对齐分析”）。
- **请求元信息未对齐**：官方默认头包含 UA 与多种附加字段，而 Kode 仅设置 x-app 与自定义 UA，缺少官方附加头与超时配置（`packages/core/src/ai/llm/anthropic/client.ts:43-56`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1006`）。
- **system prompt/前缀不一致**：Kode system prompt 与官方文本不一致，且 Kode 会统一 prepend 自有 prefix（`packages/core/src/constants/prompts.ts:14-171`；`packages/core/src/engine/message-pipeline.ts:254-265`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4295-4416`）。
- **模型连接测试不覆盖工具调用**：当前仅做“API 响应 YES”验证，不测试 tool call（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:30-134`）。

## 工具级对齐分析（复核版）

### 文件/搜索类
- Read（文件读取）：
  - Kode prompt 列出图像与 ipynb 支持（`packages/tools/src/tools/filesystem/FileReadTool/prompt.ts:15-17`），官方 prompt 在 firstParty 情况下追加 PDF 支持说明（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:504-505`）。
  - Kode PDF 读取最大 10MB（`packages/tools/src/tools/filesystem/FileReadTool/call.ts:84-88`），官方 PDF 最大 32MB（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495`）。
- Write（文件写入）：
  - Kode 输出数据不含 originalFile（`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:147-166`；`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:191-198`）。
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
  - Kode 输出仅含 stdout/stderr/lines（`packages/tools/src/tools/system/BashTool/BashTool.tsx:56-64`），官方 outputSchema 额外含 summary/rawOutputPath/isImage/structuredContent（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3489`）。
  - Kode sandbox prompt 使用 TMPDIR（`packages/tools/src/tools/system/BashTool/prompt.ts:115-121`），官方使用 `/tmp/claude/`（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2745-2748`）。
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

## Claude 请求元信息（UA/Headers）差异
- **官方 UA**：`function Yi()` 生成 UA，形态为 `claude-cli/<VERSION> (external, <entrypoint>...)`（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:237`）。
- **官方默认头**：Anthropic client 默认头包含 `x-app: "cli"`、`User-Agent: Yi()`、`x-claude-remote-container-id`/`x-claude-remote-session-id`（视环境变量）、`x-anthropic-additional-protection`（视环境变量）、`ANTHROPIC_CUSTOM_HEADERS` 注入，以及 Authorization 注入（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1006`）。
- **Kode Anthropic 默认头**：仅设置 `x-app: "cli"` 与 `User-Agent: USER_AGENT`，并可选 `ANTHROPIC_AUTH_TOKEN` Authorization（`packages/core/src/ai/llm/anthropic/client.ts:43-51`；`packages/core/src/ai/llm/anthropic/native.ts:123-132`）。
- **Kode UA**：`USER_AGENT = 
  ${PRODUCT_COMMAND}/${MACRO.VERSION} (${process.env.USER_TYPE})`（`packages/core/src/utils/http.ts:8`），与官方 `claude-cli/<VERSION> (external, ...)` 不一致（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:237`）。
- **超时/重试**：官方默认超时 600000ms（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1006`），Kode 默认 60s 且 `maxRetries: 0`（`packages/core/src/ai/llm/anthropic/client.ts:53-56`；`packages/core/src/ai/llm/anthropic/native.ts:126-127`）。
- **OpenAI 兼容路径**：Kode 对 OpenAI 兼容请求仅设置 `Content-Type` 与 `Authorization`（`packages/core/src/ai/openai/completion.ts:130-142`），未附加官方 Claude Code UA/headers。

## System Prompt 构建与前缀差异
- **Kode system prompt 内容**包含“少于 4 行回答”等硬性限制（`packages/core/src/constants/prompts.ts:66-103`），官方 system prompt 包含 Professional objectivity 与禁止非必要创建文件等指令（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4315-4319`），二者文本不一致。
- **Kode system prompt 构建**：`buildSystemPromptForSession` 仅支持 `systemPromptOverride/append` 与 JSON schema 附加（`packages/core/src/engine/systemPrompt.ts:11-39`），当前没有“官方 system prompt”模式。
- **Kode 强制 prepend CLI 前缀**：主流程在 queryLLM 前设置 `prependCLISysprompt: true`（`packages/core/src/engine/message-pipeline.ts:254-265`），Anthropic/OpenAI path 会将 `getCLISyspromptPrefix()` 注入 system prompt（`packages/core/src/ai/llm/anthropic/native.ts:158-163`；`packages/core/src/ai/llm/openai/queryOpenAI.ts:97-102`），而 `getCLISyspromptPrefix()` 返回 `You are Kode...`（`packages/core/src/constants/prompts.ts:14-16`）。

## 工具列表与官方可见性
- **Kode 默认工具集合**包含 AskExpertModel/SlashCommand/Skill 等官方不存在的工具（`packages/tools/src/registry.ts:31-55`）。
- **官方 SDK 工具输入列表**不包含上述 Kode-only 工具（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。

## 模型连接测试现状（不覆盖工具调用）
- UI 仅显示“Testing connection... / Press Enter to retry”，无重试次数、阶段信息或错误分类（`apps/cli/src/ui/ui/components/model-selector/screens/ConnectionTestScreen.tsx:47-111`）。
- 测试成功后 2 秒自动进入确认页（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/runConnectionTestFlow.ts:21-26`）。
- 连接测试主要是向 `/chat/completions` 发送固定提示并检查响应中是否包含 “YES”，不测试工具调用（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:30-134`）。
- 非 Anthropic/BigDream provider 直接返回 “Provider-specific testing not implemented yet”（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testProviderSpecificEndpoint.ts:62-66`）。
- 连接测试结果结构仅含 `success/message/endpoint/details`（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/types.ts:3-8`）。

## 结论
- 工具系统、system prompt、请求元信息、连接测试流程均存在与官方 Claude Code 不一致之处；当前状态无法视为“100% 对齐”。
