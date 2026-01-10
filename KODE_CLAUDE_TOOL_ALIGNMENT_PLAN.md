# Kode CLI 兼容性计划（证据驱动）

> 说明：Kode 是独立的开源 CLI 项目。本文件为**兼容性研究计划**，仅用于在必要时提供兼容配置，以提升模型生态中的互操作性（例如某些网关会校验特定的请求指纹/工具协议）。不作为产品宣传文本，Kode 的默认模式仍以 Kode 的产品体验为主。

## 目标

- 以兼容性为目标，收敛 Kode 的系统提示词、工具 schema、提示词与关键行为到可复核的基线，实现受限网关的稳定互操作。

## 对齐任务清单（按优先级，状态更新）

说明：

- 本仓库实现了“受限客户端兼容回退（fallback）”的多级策略；其中 `claude_code_full` 级别会使用**兼容 UA/headers + 兼容 system prompt + 兼容工具基线**。
- 下列“完成”默认指 **在 `claude_code_full` 目标下（或对应工具/接口本身）已完成对齐**；Kode 默认模式的额外能力（如扩展工具、附加提示词风格）不会被当作“必须移除”的阻塞项，除非它会影响 `claude_code_full` 的严格对齐。

### P0 — 直接影响输出/协议的差异

1. 系统提示词对齐（官方 system prompt + prefix）

- 证据：Kode 强制“少于 4 行回答”（`packages/core/src/constants/prompts.ts:66-103`），官方包含 Professional objectivity 与禁止非必要创建文件（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4315-4319`）。
- 工作内容：
  - ✅ 已新增 `getClaudeCodeSystemPrompt(...)` + `getClaudeCodeSyspromptPrefix()` 并在 `claude_code_headers_system/claude_code_full` 级别启用（`packages/core/src/ai/llm.ts:337`；`packages/core/src/constants/prompts.ts`）。
  - ⚠️ Kode 默认 system prompt 仍保留 Kode 自身的风格/限制；这不影响 `claude_code_full`，但若目标是“默认模式也逐字节一致”，需另行收敛。
- 验收：在 `claude_code_full` 下，system prompt 来源切换为官方 builder（见 `packages/core/src/ai/llm.ts:337`）。

2. FileWrite 输出 schema 对齐 ✅

- 证据：Kode 输出缺 originalFile（`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:147-166`），官方 outputSchema 含 originalFile（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1263`）。
- 工作内容：
  - ✅ 已补齐 FileWrite 输出 `originalFile` 并在 create/update 都返回（`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:152`）。
- 验收：FileWrite 输出字段与官方一致（含 originalFile）。

3. FileEdit 输出 schema 对齐 ✅

- 证据：Kode 输出缺 userModified/replaceAll（`packages/tools/src/tools/filesystem/FileEditTool/FileEditTool.tsx:232-265`），官方 outputSchema 包含这些字段（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1246`）。
- 工作内容：
  - ✅ 已补齐 `userModified` 与 `replaceAll` 并在 call 返回（`packages/tools/src/tools/filesystem/FileEditTool/FileEditTool.tsx:238-239`）。
- 验收：FileEdit 输出字段与官方一致。

4. Bash 输出 schema 与提示词对齐 ✅

- 证据：Kode Bash 输出仅含 stdout/stderr/lines（`packages/tools/src/tools/system/BashTool/BashTool.tsx:56-64`），官方 outputSchema 额外含 summary/rawOutputPath/isImage/structuredContent（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3489`）。
- 证据：Kode sandbox prompt 的临时目录说明使用 `/tmp/kode/`（`packages/tools/src/tools/system/BashTool/prompt.ts:105`），与 sandbox runtime 默认 TMPDIR 一致（`packages/runtime/src/shell/macosSandbox.ts:18`）。
- 证据：Kode commit attribution 使用 `PRODUCT_NAME`/`PRODUCT_URL`（`packages/tools/src/tools/system/BashTool/prompt.ts:24`）。
- 工作内容：
  - ✅ 已补齐 Bash 输出字段（含 `summary/rawOutputPath/isImage/structuredContent`）并实现官方风格的 output summarization 落盘（`packages/tools/src/tools/system/BashTool/summarizeOutput.ts`）。
  - ✅ prompt 的关键安全语义保持一致，同时使用 Kode 署名与 Kode sandbox 的临时目录路径（避免与产品身份/运行时不一致）。
- 验收：Bash 输出字段与 summarization 行为对齐；prompt 语义对齐且与 Kode runtime 一致。

5. Task 输出 usage 结构对齐 ✅

- 证据：Kode Task 输出 usage 为 unknown（`packages/tools/src/tools/ai/TaskTool/schema.ts:35-51`），官方 outputSchema 明确定义 usage 结构（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2880`）。
- 工作内容：
  - ✅ `TaskUsage` 已按官方字段定义（`packages/tools/src/tools/ai/TaskTool/schema.ts:22`）。
- 验收：Task 完成态输出 usage 字段结构与官方一致。

### P1 — 行为/协议边界差异

6. FileRead PDF 行为与提示词对齐 ✅

- 证据：Kode PDF 最大 10MB（`packages/tools/src/tools/filesystem/FileReadTool/call.ts:84-88`），官方为 32MB 且 prompt 提及 PDF 条件支持（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495-505`）。
- 工作内容：
  - ✅ PDF 限制已改为 32MB（`packages/tools/src/tools/filesystem/FileReadTool/call.ts:111`）。
  - ✅ Read prompt 已在 firstParty 条件下追加 PDF 说明（`packages/tools/src/tools/filesystem/FileReadTool/prompt.ts:8-11`）。
- 验收：PDF 行为与提示词对齐。

7. Task prompt 对齐 ✅

- 证据：Kode prompt 强调 slash command/agent 列表（`packages/tools/src/tools/ai/TaskTool/prompt.ts:36-55`），官方强调 background/resume/parallel 等使用细节（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1296-1305`）。
- 工作内容：
  - ✅ Task prompt 已改为官方文案（`packages/tools/src/tools/ai/TaskTool/prompt.ts`）。
- 验收：Task prompt 文案对齐。

8. TaskOutput 输入与别名对齐 ✅

- 证据：Kode 额外兼容 agentId/bash_id/wait_up_to（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:50-65`），官方 schema 不包含（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:90-102`）。
- 证据：官方 TaskOutput 定义含 aliases（AgentOutputTool/BashOutputTool）（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2891`）。
- 工作内容：
  - ✅ 已收敛 TaskOutput inputSchema 到官方字段集合（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:11-28`）。
  - ✅ 通过别名解析保持兼容（`packages/core/src/utils/toolNameAliases.ts:8-26`）。
- 验收：TaskOutput 工具输入与官方一致；别名调用可被解析到 TaskOutput。

9. ExitPlanMode 输入/输出对齐 ✅

- 证据：Kode inputSchema 增加 launchSwarm/teammateCount（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:27-37`），官方 ExitPlanModeInput 为空对象（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:104-106`）。
- 证据：Kode 结果说明包含 swarm 指令（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:143-185`），官方结果文本不含这些内容（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2370-2387`）。
- 工作内容：
  - ✅ 已移除额外输入与 swarm 分支；inputSchema 为空对象 passthrough（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:22`）。
- 验收：ExitPlanMode 输入/输出与官方一致（以 sdk-tools + cli.js 为基线）。

10. AskUserQuestion 输入 schema 对齐 ✅

- 证据：Kode inputSchema 额外允许 answers（`packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:21-27`），官方 AskUserQuestionInput 不含该字段（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:294-419`）。
- 工作内容：
  - ✅ AskUserQuestion inputSchema 已仅包含 questions；answers 仅作为输出（`packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:18-45`）。
- 验收：AskUserQuestion 输入 schema 对齐。

11. TodoWrite 输出与持久化差异收敛（输出 ✅；持久化 = 扩展）

- 证据：Kode output 含 agentId（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:42-47`），官方 outputSchema 仅 oldTodos/newTodos（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:829-839`）。
- 证据：Kode 使用 todoStorage/本地持久化（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:5-15`），官方使用 app state todos（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:829-839`）。
- 工作内容：
  - ✅ 输出 schema/返回已为 `oldTodos/newTodos`（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:202-217`）。
  - ⚠️ 本地持久化仍保留为 Kode 扩展（不影响 `claude_code_full` 的工具协议一致性）。
- 验收：TodoWrite 输出与官方一致；扩展行为已文档化（见对齐与回退方案文档）。

### P2 — 生态/扩展差异

12. WebSearch 行为对齐 ✅

- 证据：Kode 使用 DuckDuckGo 本地检索（`packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx:152-178`），官方使用 server tool `web_search_20250305`（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2901`）。
- 工作内容：
  - ✅ 已改为仅使用 server tool，并通过 streaming 事件 yield `Searching:` / `Found ... results` 的进度更新（对齐 `cli.js:2901`；实现见 `packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx`）。
- 验收：WebSearch 行为与输出结构对齐（server tool + progress）。

13. WebFetch 权限逻辑对齐 ✅

- 证据：官方 WebFetch 定义含 checkPermissions 与预置允许域列表（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2309`），Kode WebFetch 未实现 checkPermissions（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:41-61`）。
- 工作内容：
  - ✅ 已实现 claude.ai domain_info 预检、同源 redirect 判定与官方 Accept header 行为（见 `packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx`、`packages/tools/src/tools/network/WebFetchTool/utils.ts`）。
  - ✅ 预置域与权限策略由权限层统一实现（`packages/core/src/permissions/policies/web.ts`）。
- 验收：WebFetch 权限策略对齐。

14. MCP 工具 prompt 对齐 ✅

- 证据：Kode MCPTool prompt 为空（`packages/tools/src/tools/mcp/MCPTool/prompt.ts:1-3`），官方 MCP prompt 强制“先加载再调用”并给出查询模式（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2947-2965`）。
- 工作内容：
  - ✅ 官方“先加载再调用”的强制提示属于 `MCPSearch`（`cli.js:2947-2965`）；Kode `MCPSearch` prompt 已对齐（`packages/tools/src/tools/mcp/MCPSearchTool/prompt.ts:5-74`）。
  - ✅ 基础 `mcp` tool 的 prompt/description 在官方为动态/空串默认值，Kode 保持一致（`packages/tools/src/tools/mcp/MCPTool/prompt.ts:1-6`）。
- 验收：MCP 使用流程与官方一致。

15. SDK 工具列表对齐（LSP/EnterPlanMode）

- 证据：sdk-tools 输入列表未列出 LSP/EnterPlanMode（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`），但 cli.js 中存在工具定义（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2927-2945`；`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2475`）。
- 工作内容：
  - 若以 sdk-tools 为权威对齐目标，需决定是否隐藏/禁用这些工具；或反向补齐 SDK 生成源。
- 验收：对外工具列表与官方一致。

16. Kode-only 工具处置

- 证据：Kode registry 中含 AskExpertModel/SlashCommand/Skill（`packages/tools/src/registry.ts:4-54`），官方输入列表无这些工具（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts:11-29`）。
- 工作内容：
  - 明确这些工具是 Kode 扩展还是需从默认工具集移除；如保留，需在对齐报告与用户文档中标注为扩展。
- 验收：工具集合与官方对齐或明确标注扩展范围。

## 交付建议

- 先完成 P0（schema 与系统提示词），再处理 P1/P2。
- 每个工具变更完成后，复查对应 prompt/schema 与官方证据行号一致。
