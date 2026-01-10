# Kode CLI 兼容性回退方案（证据驱动）

> 说明：Kode 是独立的开源 CLI 项目。本文件仅用于受限客户端场景下的兼容回退，以提升模型生态中的互操作性（例如某些网关会校验请求指纹/工具协议）。Kode 的默认行为保持 Kode-first；兼容逻辑仅作为可选/回退路径，不引入遥测或强绑定的供应商专有机制。

## 目标

- 工具系统：在需要时提供“严格兼容模式”，将 schema/prompt/关键行为收敛到参考实现的可复核形态；默认模式仍保留 Kode 的扩展能力与体验。
- Claude 模型请求元信息（UA/headers）：默认保持 Kode 请求信息；仅在兼容回退级别启用兼容 headers/UA。
- 模型连接测试升级为“真实 tool call 验证 + 重试 + 友好 UI”。

## 状态更新（已完成 / 仍待完成）

> 本文最初是“计划文档”。以下状态更新只基于当前仓库代码可复核的事实；更细的证据引用见 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md`。

已完成（可复核）：

- ✅ Claude 模型兼容回退（headers/system/tools）已落地：`packages/core/src/ai/llm.ts:337`、`packages/core/src/ai/llm/claudeCodeFallback.ts:1`
- ✅ 兼容 headers/UA 实现并仅在回退级别启用：`packages/core/src/ai/llm/claudeCodeFallback.ts:242`（`buildClaudeCodeUserAgent/buildClaudeCodeHeaders`）
- ✅ 连接测试升级为真实 tool-use 写文件验证 + 网络/超时重试 + 回退尝试：`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testAnthropicMessagesEndpoint.ts`
- ✅ 关键工具协议差异已收敛：Read PDF 32MB、Write/Edit 输出字段、Task prompt、Task usage、ExitPlanMode/AskUserQuestion input、Bash 输出摘要落盘、WebFetch domain_info 预检与 apply 行为（详见 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md`）。

仍待完成（有明确证据可指向）：

- ⚠️ Claude Code system prompt 为动态 builder；目前为“兼容复刻”，严格逐字节一致仍需同环境输出对照验证（见 `KODE_CLAUDE_TOOL_PARITY_ANALYSIS_V4.md#d1`）。

## A. 工具系统 100% 对齐清单（按优先级）

### P0 — 直接影响工具协议输出

1. System Prompt 对齐

- 证据：Kode system prompt 含“少于 4 行回答”等硬限制（`packages/core/src/constants/prompts.ts:66-103`）；官方包含 Professional objectivity 与 “NEVER create files…”（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:4315-4319`）。
- 修改点：重写 `packages/core/src/constants/prompts.ts` 对齐官方文本；保留 Kode 自定义内容需明确标注为扩展。
- 验收：对照官方 cli.js 原文逐段一致。

2. FileWrite 输出 schema 对齐

- 证据：Kode 输出缺 originalFile（`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:147-166`；`packages/tools/src/tools/filesystem/FileWriteTool/FileWriteTool.tsx:191-198`）；官方包含 originalFile（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1263`）。
- 修改点：补齐 outputSchema 与返回 payload。

3. FileEdit 输出 schema 对齐

- 证据：Kode 输出缺 userModified/replaceAll（`packages/tools/src/tools/filesystem/FileEditTool/FileEditTool.tsx:232-265`）；官方含这些字段（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:1246`）。
- 修改点：补齐 outputSchema 与返回 payload。

4. Bash 输出 schema 与 prompt 对齐

- 证据：Kode 输出字段少于官方（`packages/tools/src/tools/system/BashTool/BashTool.tsx:56-64` vs `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:3489`）。
- 证据：提示词 TMPDIR/commit 署名与官方不一致（`packages/tools/src/tools/system/BashTool/prompt.ts:11-36`；`packages/tools/src/tools/system/BashTool/prompt.ts:115-121` vs `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2712`、`cli.js:2745-2748`）。
- 修改点：补齐输出字段、对齐 prompt 文案。

5. Task 输出 usage 对齐

- 证据：Kode usage 为 unknown（`packages/tools/src/tools/ai/TaskTool/schema.ts:35-51`）；官方 outputSchema 明确 usage（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:2880`）。
- 修改点：对齐 outputSchema 与输出内容。

### P1 — 输入/行为边界

6. FileRead PDF 行为 & prompt 对齐

- 证据：Kode PDF 10MB（`packages/tools/src/tools/filesystem/FileReadTool/call.ts:84-88`），官方 32MB（`/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js:495`）；官方 prompt 追加 PDF 条件说明（`cli.js:504-505`）。
- 修改点：对齐限制与 prompt。

7. Task prompt 对齐

- 证据：Kode/官方 prompt 文本不一致（`packages/tools/src/tools/ai/TaskTool/prompt.ts:36-55` vs `cli.js:1296-1305`）。
- 修改点：更新为官方文本。

8. TaskOutput 输入/别名对齐

- 证据：Kode 额外 agentId/bash_id/wait_up_to（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:50-65`）；官方不含（`sdk-tools.d.ts:90-102`）。
- 证据：官方含 aliases（`cli.js:2891`），Kode 无（`packages/tools/src/tools/system/TaskOutputTool/TaskOutputTool.tsx:129-151`）。
- 修改点：移除额外字段并添加 aliases（或显式标注为扩展）。

9. ExitPlanMode 输入/输出对齐

- 证据：Kode 额外输入与输出文本（`packages/tools/src/tools/interaction/PlanModeTool/ExitPlanModeTool.tsx:27-37`、`:143-185`）；官方输入为空且输出不同（`sdk-tools.d.ts:104-106`；`cli.js:2370-2387`）。
- 修改点：对齐输入与输出文本。

10. AskUserQuestion 输入对齐

- 证据：Kode 额外 answers（`packages/tools/src/tools/interaction/AskUserQuestionTool/AskUserQuestionTool.tsx:21-27`），官方无（`sdk-tools.d.ts:294-419`）。
- 修改点：移除 answers 或隐藏为内部字段。

11. TodoWrite 输出/持久化对齐

- 证据：Kode output 含 agentId（`packages/tools/src/tools/interaction/TodoWriteTool/TodoWriteTool.tsx:42-47`），官方仅 oldTodos/newTodos（`cli.js:829-839`）。
- 修改点：输出字段对齐；持久化逻辑与官方保持一致或标注为扩展。

### P2 — 网络/MCP/工具集合

12. WebSearch 行为对齐

- 证据：官方使用 server tool `web_search_20250305` 且基于 streaming 推送进度（`cli.js:2901`）。
- 修改点：已对齐为 server tool + streaming progress（实现见 `packages/tools/src/tools/search/WebSearchTool/WebSearchTool.tsx`）。

13. WebFetch 权限流程对齐

- 证据：官方带 checkPermissions 与预置域（`cli.js:2309`），Kode 未实现（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:41-61`）。
- 修改点：对齐权限流程与默认允许域。

14. MCP prompt 对齐

- 证据：官方“先加载再调用”的强制提示属于 `MCPSearch`（`cli.js:2947-2965`）。
- 修改点：`MCPSearch` prompt 已对齐（`packages/tools/src/tools/mcp/MCPSearchTool/prompt.ts:5-74`）；基础 `mcp` tool 默认 prompt/description 为空以匹配官方（`packages/tools/src/tools/mcp/MCPTool/prompt.ts:1-6`）。

15. 工具集合对齐

- 证据：Kode 默认工具含 AskExpertModel/SlashCommand/Skill（`packages/tools/src/registry.ts:31-55`），官方 sdk-tools 未列出（`sdk-tools.d.ts:11-29`）。
- 修改点：在“官方对齐模式”下过滤 Kode-only 工具。

## B. Claude 请求元信息对齐 + fallback 策略

### B1. 现状差异（证据）

- 兼容 UA 格式：`claude-cli/<VERSION> (external, <entrypoint>...)`（官方构造见 `cli.js:237`；Kode 实现见 `packages/core/src/ai/llm/claudeCodeFallback.ts:243-255`）。
- Kode 默认 UA 为 `kode/<version> (<USER_TYPE>)`（`packages/core/src/utils/http.ts:8`），仅在受限客户端 fallback 中切换到兼容 UA（`packages/core/src/ai/llm/claudeCodeFallback.ts:243-255`）。
- Kode 默认 Anthropic 请求头与 OpenAI 兼容请求头保持精简（`packages/core/src/ai/llm/anthropic/client.ts`、`packages/core/src/ai/llm/anthropic/native.ts`、`packages/core/src/ai/openai/completion.ts`）。

### B2. 目标策略（分级 fallback，按用户要求）

1. **Level 0（默认）**：保持 Kode 现有请求信息 + Kode system prompt + Kode 工具列表。
2. **Level 1**：官方请求头 + Kode system prompt + Kode 工具列表。
3. **Level 2**：官方请求头 + 官方 system prompt + Kode 工具列表。
4. **Level 3**：官方请求头 + 官方 system prompt + 官方工具列表（MCP 动态扩展保留）。

### B3. 触发条件（证据）

- **受限客户端判定**：`classifyRequestFailure(...)` 将错误分类为 `claude_code_only/auth/billing/network/other`（`packages/core/src/ai/llm/claudeCodeFallback.ts:84-223`）。
- **非网络/鉴权/计费不进入 fallback**：`shouldAttemptClaudeCodeFallback(...)` 仅在 `claude_code_only` 时返回 true（`packages/core/src/ai/llm/claudeCodeFallback.ts:230-236`）。
- **无显式提示但 403 的兜底**：当模型名包含 `claude` 且状态码为 403 时，归类为 `claude_code_only`（`packages/core/src/ai/llm/claudeCodeFallback.ts:214-223`）。

### B4. 实现落点（代码位置）

- **请求头构造**：`buildClaudeCodeHeaders()` 注入到 Anthropic 与 OpenAI 兼容路径（`packages/core/src/ai/llm/anthropic/client.ts`、`packages/core/src/ai/llm/anthropic/native.ts`、`packages/core/src/ai/openai/completion.ts`、`packages/core/src/ai/openai/responsesApi.ts`）。
- **UA 对齐**：兼容 UA 由 `buildClaudeCodeUserAgent()` 生成（`packages/core/src/ai/llm/claudeCodeFallback.ts:243-255`），`CLAUDE_CODE_ENTRYPOINT` 在 CLI 入口处按交互模式补齐（`apps/cli/src/entrypoints/cli/cliParser/rootAction.ts:118-125`）。
- **system prompt 切换**：fallback step 在 `packages/core/src/ai/llm.ts` 选择 `getClaudeCodeSystemPrompt(...)` 或 `getSystemPrompt(...)`。
- **兼容 prompt 去扩展**：fallback 兼容 prompt 构建时剔除自定义 additions（如 Output Styles），确保指纹稳定（`packages/core/src/ai/llm.ts:341-364`）。
- **前缀注入**：按 step 选择 `getCLISyspromptPrefix` 或 `getClaudeCodeSyspromptPrefix`（`packages/core/src/ai/llm.ts:366-369`；`packages/core/src/constants/prompts.ts:180-204`）。
- **工具列表过滤**：`filterToolsForClaudeCode(...)` 仅保留基线工具与 `mcp__*`（`packages/core/src/ai/llm/claudeCodeFallback.ts:395-401`）。

### B5. 兼容请求头策略（证据）

- Kode 兼容请求头由 `buildClaudeCodeHeaders()` 生成，并仅在 fallback step 启用（`packages/core/src/ai/llm/claudeCodeFallback.ts:279-317`、`packages/core/src/ai/llm.ts`）。

### B6. 用户体验（低摩擦策略）

- **默认自动模式**：默认保持 Level 0；仅在“受限客户端”信号成立时自动进入 Level 1→2→3（`packages/core/src/ai/llm.ts`）。
- **手动策略选择**：模型配置页提供请求策略选项（默认 Auto），作为判定不确定时的兜底（`apps/cli/src/ui/ui/components/model-selector/options.ts:5-27`）。
- **说明文案**：强调这是为受限网关的兼容需求启用的 fallback，不改变 Kode 默认行为。

## C. 模型连接测试升级（工具调用验证 + 重试 + UI）

### C1. 现状证据

- 测试仅检查 “YES” 文本响应，不测试工具调用（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:30-134`）。
- 非 Anthropic/BigDream provider 直接返回 “Provider-specific testing not implemented yet”（`testProviderSpecificEndpoint.ts:62-66`）。
- UI 不显示阶段/重试/错误分类（`ConnectionTestScreen.tsx:47-111`）。

### C2. 目标测试流程（按用户要求）

1. **Tool Call 验证**：让模型调用 `Write` 工具写入临时文件，并在本地校验文件存在与内容一致。
2. **清理**：测试完成后删除临时文件。
3. **多级 fallback**：在 “Claude Code-only” 判定触发后，按 Level 0→1→2→3 重试验证。

### C3. 实现落点（代码位置）

- **新增连接测试实现**：替换或扩展 `performConnectionTest`（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/performConnectionTest.ts:11-127`）。
- **测试结果结构扩展**：扩展 `ConnectionTestResult` 增加 `phase/attempt/retryInMs/errorCategory`（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/types.ts:3-8`）。
- **UI 展示**：`ConnectionTestScreen` 显示阶段、剩余重试与错误分类（`apps/cli/src/ui/ui/components/model-selector/screens/ConnectionTestScreen.tsx:47-111`）。
- **自动进入确认页**：保留或调整 `runConnectionTestFlow` 的 2s 自动跳转（`runConnectionTestFlow.ts:21-26`）。

### C4. 重试与错误分类

- **重试策略**：自动重试 3 次，间隔每次 +5 秒（用户要求）。
- **错误分类**：基于现有错误处理仅能识别 `x-api-key` / 余额不足等（`packages/core/src/ai/llm/errors.ts:11-38`），需要新增分类层后再决定 fallback。

### C5. 测试临时文件路径（权限考虑）

- 现有权限系统将 `.kode` 视为敏感目录（`packages/core/src/permissions/fileToolPermissionEngine/paths.ts:17-19`）。
- **计划**：选用安全可写目录（如项目根目录下临时文件或系统临时目录），并在权限引擎中做最小化豁免或显式提示。

### C6. 结果提示

- 若 API 正常但 tool call 验证失败，UI 提示“模型可能不支持 tool use”，建议更换更强模型（按用户要求提示 glm4.7 / minimax2.1 / claude sonnet 4.5）。
- 对网络/超时/余额/密钥问题，提示错误类型并自动重试，不触发 fallback。

## D. 文档与注释

- 在 `docs/` 或 README 中新增 “Claude Code 兼容请求策略与 fallback 说明”。
- 在实现处添加注释，明确该策略用于 Claude Code-only 供应商的兼容 fallback。

## 验收标准

- 工具 schema/prompt/行为对齐：以官方 cli.js & sdk-tools.d.ts 为基线逐项比对。
- Claude 请求元信息对齐：UA/headers 字段与官方一致（`cli.js:237`、`cli.js:1006`）。
- 连接测试通过：完成 tool call 写入/读取验证，UI 显示阶段、重试与错误分类。
