# Kode CLI 兼容性证据（V4）

本文件只基于**可直接复核的原文证据**（Kode 源码 + 官方 `cli.js`/`sdk-tools.d.ts`）描述“已对齐/仍差异”的现状；不做无证据猜测。

> 说明：Kode 是独立的开源 CLI 项目。本文件的目的仅是为了在 Claude 模型生态中提升互操作性与兼容性（例如某些网关会校验特定的请求指纹/工具协议），并不用于在产品心智上替代任何上游客户端。

## 证据来源（固定路径）

- Kode 源码：`packages/**`、`apps/**`
- 官方参考：
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/cli.js`
  - `/Users/baicai/Desktop/MyT/Kode/pr/cc_official/claude-code-main/node_modules/@anthropic-ai/claude-code/sdk-tools.d.ts`

## 结论（可复核）

- Kode 已实现“Claude Code 兼容回退（fallback）”的**四级策略**：headers / system prompt / 工具 allowlist 逐级对齐（见 `packages/core/src/ai/llm.ts:337` 与 `packages/core/src/ai/llm/claudeCodeFallback.ts:18`）。
- 本轮对齐把 V3 中列出的多项差异已收敛（Read PDF 32MB、Write/Edit 输出字段、Task prompt、TaskOutput alias、AskUserQuestion schema、TodoWrite 输出、WebFetch 行为/提示词等），并补上 Bash 输出摘要/落盘机制（与官方 `cli.js` 的 `bash_output_summarization` 逻辑对齐）。
- 仍无法在“证据级别”宣称全量 100% 一致的点：官方系统提示词 builder 本身是动态拼装（Kode 以兼容实现复刻），严格逐字节一致需要在同环境下对照输出进行验证（见下文 D）。

---

## A. Claude Code 兼容回退（headers / system prompt / tools）

### A1) 回退步骤与工具白名单（ban Kode-only 内置工具）

- Kode：`packages/core/src/ai/llm/claudeCodeFallback.ts:18`
  - `CLAUDE_CODE_TOOL_ALLOWLIST` 明确列出对齐模式下允许的官方工具集合（含 `Task/Bash/TaskOutput/.../MCPSearch/mcp/...`），并已移除 `Skill`（与官方 sdk-tools 列表一致：`sdk-tools.d.ts` union 不含 Skill）。
- Kode：`packages/core/src/ai/llm/claudeCodeFallback.ts:392`
  - `filterToolsForClaudeCode(...)` 在 `claude_code_full` 模式下过滤内置工具，仅保留 allowlist + `mcp__*`（用户要求：MCP 动态扩展保留）。

### A2) LLM 查询入口按错误类别“只在 Claude Code-only 触发回退”

- Kode：`packages/core/src/ai/llm.ts:337`
  - `buildClaudeCodeFallbackPlan(...)` 生成逐级回退步骤，`queryLLMWithPromptCaching` 按 step 选择 headers/system/tools。
  - `shouldAttemptClaudeCodeFallback(error, modelName)` 为 false 时**不会**进入下一层（避免网络/余额/密钥等错误触发回退；实际调用点见 `packages/core/src/ai/llm.ts:401`）。
- Kode：`packages/core/src/ai/llm/claudeCodeFallback.ts:182`
  - `classifyRequestFailure(...)` 分类为 `claude_code_only/auth/billing/network/other`，并在“Claude 模型 + 403 且未匹配 auth/billing/network 线索”时将其视作 `claude_code_only` 信号以触发回退（`packages/core/src/ai/llm/claudeCodeFallback.ts:222`）。

### A3) 官方 UA/headers 与 timeout 对齐（仅在回退级别启用）

- Kode：`packages/core/src/ai/llm/claudeCodeFallback.ts:242`
  - `buildClaudeCodeUserAgent()` 生成 `claude-cli/2.1.2 (external, <entrypoint>...)`（官方 `cli.js:237`）。
- Kode：`packages/core/src/ai/llm/anthropic/client.ts:43`
  - `requestHeadersProfile === 'claude_code'` 时用 `buildClaudeCodeHeaders()`，并设置 `CLAUDE_CODE_DEFAULT_TIMEOUT_MS = 600000`。
- Kode：`packages/core/src/ai/llm.ts:341-364`
  - 兼容 prompt 构建时剔除 Kode 自定义 additions（如 Output Style/权限摘要），并显式 `outputStyleActive: false`，确保指纹稳定。

---

## B. 工具对齐证据（关键项）

### B1) Task prompt（agent 列表/并行/后台/resume）对齐

- 官方：`cli.js:1280`
  - `eZ2(...)` 生成 Task tool prompt，包含 `All tools`、`run_in_background`、`resume` 等段落。
- Kode：`packages/tools/src/tools/ai/TaskTool/prompt.ts:34`
  - 默认 tools 文案已改为 `All tools`（与官方一致），且 `When NOT to use...` / `Usage notes...` 段落与官方一致（见 `packages/tools/src/tools/ai/TaskTool/prompt.ts:45` 起）。

### B2) WebFetch（权限前置 + domain_info 预检 + redirect 行为 + apply 使用无前缀 LLM 调用）

#### B2.1 WebFetch prompt/description 原文一致

- 官方：`cli.js:470`（`JzB=`，含 `Usage notes` 与 MCP 优先提示）
- Kode：`packages/tools/src/tools/network/WebFetchTool/prompt.ts:1`（同文本）
- 官方：`cli.js:2309`（`Claude wants to fetch content from ...`）
- Kode：`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:118`（当前为去品牌文案：`The assistant wants to fetch content from ...`；语义一致但不逐字节一致）

#### B2.2 domain_info 预检（claude.ai）

- 官方：`cli.js:2309`（`Ei5()` 调 `https://claude.ai/api/web/domain_info?...`，并在 `Og2()` 中根据 `allowed/blocked/check_failed` 抛出 `DomainBlockedError/DomainCheckFailedError`）
- Kode：`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:69`
  - `webFetchDomainPreflight(...)` 对齐调用同一 URL
  - 错误文案（语义一致；去品牌）：
    - `Unable to fetch from ${domain}`（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:55`）
    - `Unable to verify if domain ... blocking the required preflight endpoint.`（`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:64`）

#### B2.3 fetch 请求头/redirect 判定

- 官方：`cli.js:2309`（`Lg2()` headers 仅 `Accept:"text/markdown, text/html, */*"`；`zi5()` 仅同源才跟随）
- Kode：`packages/tools/src/tools/network/WebFetchTool/utils.ts:191`
  - `fetchWithRedirectDetection(...)` 仅设置 `Accept: 'text/markdown, text/html, */*'` 且 `redirect:'manual'`，并用 `isSameHost(...)` 判定是否同源跟随（不同 host 则返回 redirect 信息让用户二次调用）。

#### B2.4 apply 阶段 LLM 调用（无 CLI 前缀）

- 官方：`cli.js:2309`（`Mg2()` 使用 `jK({ systemPrompt:[], ... hasAppendSystemPrompt:false })`）
- Kode：`packages/tools/src/tools/network/WebFetchTool/WebFetchTool.tsx:299`
  - 由 `queryLLM(... prependCLISysprompt:false, systemPrompt:[])` 执行 apply（避免注入 Kode CLI 前缀，与官方行为一致）。

### B3) Bash 输出摘要（should_summarize XML + raw 输出落盘路径 + summary 注记）

- 官方：`cli.js:3390`（`B89()` summarization system prompt；`G89()` user prompt；`W97=5000` 阈值；`F97()` 将完整输出写到 `bash-outputs/<conversationKey>/...`；`z97()` 追加 Note）
- Kode：
  - `packages/tools/src/tools/system/BashTool/summarizeOutput.ts:13`：system prompt 原文对齐官方 `B89()`
  - `packages/tools/src/tools/system/BashTool/summarizeOutput.ts:57`：user prompt 原文对齐官方 `G89()`
  - `packages/tools/src/tools/system/BashTool/summarizeOutput.ts:10`：阈值 `5000`（官方 `W97=5000`）
  - `packages/tools/src/tools/system/BashTool/summarizeOutput.ts:94`：落盘目录 `${getKodeBaseDir()}/bash-outputs/<conversationKey>/...`（与官方 `V97="bash-outputs"` + conversationKey 目录结构一致）
  - `packages/tools/src/tools/system/BashTool/summarizeOutput.ts:124`：summary 包装 `[Summarized output]` + `Note: The complete bash output is available at ...`（对齐官方 `z97()`）
  - `packages/tools/src/tools/system/BashTool/executeForeground.tsx:211`：实际执行后调用 `maybeSummarizeBashOutput(...)`，写入 `summary/rawOutputPath` 字段。

### B4) Tool alias：TaskOutput（AgentOutputTool/BashOutputTool → TaskOutput）

- 官方：`cli.js:2891`（TaskOutput tool `aliases:["AgentOutputTool","BashOutputTool"]`）
- Kode：`packages/core/src/utils/toolNameAliases.ts:10`（解析别名到 `TaskOutput`，兼容官方历史别名输入）

---

## C. 模型配置页连接测试升级（真实 tool-use 验证 + 重试 + 回退）

- Kode：`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/performConnectionTest.ts:43`
  - 连接测试按 `buildClaudeCodeFallbackPlan(...)` 逐步尝试（仅 `claude_code_only` 才继续下一 step）。
- Kode：`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testAnthropicMessagesEndpoint.ts:121`
  - 强制工具调用：`tool_choice: { type:'tool', name:'Write' }`（要求模型返回 tool_use）
  - 网络/超时重试：最多 3 次，每次 +5s（`retryInMs = attempt * 5000`）
  - 本地执行验证：收到 tool_use 后，使用真实 `Write` 工具实现执行落盘并校验（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testAnthropicMessagesEndpoint.ts:316`）。
- Kode：`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:229`
  - OpenAI 兼容端点同样强制工具调用：`tool_choice: { type:'function', function:{ name:'Write' } }`
  - 本地执行验证：使用真实 `Write` 工具实现执行落盘并校验（`apps/cli/src/ui/ui/components/model-selector/actions/connectionTest/testChatEndpoint.ts:396-409`）。

---

## D. 仍需明确范围/行为差异（只列“有证据可指向”的）

### D1) Claude Code system prompt：官方为动态 builder；Kode 为兼容复刻实现

- 官方：`cli.js:4294`（system prompt builder `zb(...)`，并拼接 env/security/date 等）
- Kode：`packages/core/src/constants/prompts.ts:104`（`getClaudeCodeSystemPrompt(...)`）
  - 该实现目标是“兼容对齐”，但由于官方是运行期拼装且混淆，严格逐字节一致需要在同环境下对照输出进行验证（本文件不做无证据断言）。

---

## E. 权限模式（dontAsk / bypassPermissions）与非交互行为（证据）

> 本节只聚焦“权限模式语义 + 非交互场景”，并给出官方 `cli.js` 的可复核证据片段；不做无证据推断。

### E1) 官方：dontAsk / prompts unavailable 语义（ask → auto-deny）

- 官方：`cli.js:4553`（`TC=async...` 包装 `VE7` 的返回）
  - 当某次工具调用需要 `ask` 时：
    - `toolPermissionContext.mode==="dontAsk"` → 返回 deny，并给出消息：
      - `Permission to use ${A.name} has been auto-denied in dontAsk mode.`
    - `toolPermissionContext.shouldAvoidPermissionPrompts` → 返回 deny，并给出消息：
      - `Permission to use ${A.name} has been auto-denied (prompts unavailable).`

- Kode：`packages/core/src/permissions/engine.ts:56`
  - `dontAsk`：当权限检查需要提示用户时，统一转为 `shouldPromptUser:false` 的 deny（文案：`Permission to use ${tool.name} has been auto-denied in dontAsk mode.`）。
  - `shouldAvoidPermissionPrompts`：当 prompts 不可用时，统一转为 `shouldPromptUser:false` 的 deny（文案：`Permission to use ${tool.name} has been auto-denied (prompts unavailable).`）。

### E2) 官方：bypassPermissions 的可用性与选择优先级（Statsig/组织策略可禁用）

- 官方：`cli.js:4553`（`DH9(...)`）
  - 选择优先级（按顺序 push 到候选列表）：
    1. `dangerouslySkipPermissions` → `bypassPermissions`
    2. `permissionModeCli`（命令行指定）
    3. `settings.permissions.defaultMode`
    4. fallback：`default`
  - 若 bypass 被 gate / settings 禁用（`tengu_disable_bypass_permissions_mode` / `permissions.disableBypassPermissionsMode==="disable"`），则跳过并继续下一个候选，并设置通知文案。

- 官方：`cli.js:4553`（`WH9(...)`）
  - `isBypassPermissionsModeAvailable:(mode==="bypassPermissions" || allowDangerouslySkipPermissions) && !gateDisabled && !settingsDisabled`
  - 表明 `allowDangerouslySkipPermissions` 的语义是“允许 bypass 模式可用（不一定立刻启用 bypass）”。

- Kode：
  - `apps/cli/src/entrypoints/cli/print/runNonTextPrintMode.ts:120`
    - 非交互模式下：`isBypassAvailable = !safe || allowDangerouslySkipPermissions || dangerouslySkipPermissions`。
  - `apps/cli/src/entrypoints/cli/print/runNonTextPrintMode.ts:171`
    - 当用户未显式指定 `--permission-mode` 且无自定义规则/目录时，自动将 mode 切到 `bypassPermissions`（避免脚本阻塞）。
  - `apps/cli/src/entrypoints/cli/cliParser/rootAction.ts:100`
    - root 下禁止 `--dangerously-skip-permissions`（未 sandbox）以防止高危误用。

### E3) 官方：Bash 在 sandbox 下的“asked rule”例外（可自动放行）

- 官方：`cli.js:4553`（`VE7(...)`）
  - 当命中 ask rule 时，存在 Bash 特例：
    - `if(!(A.name===C9 && RB.isSandboxingEnabled() && RB.isAutoAllowBashIfSandboxedEnabled())) return {behavior:"ask"...}`
  - 结论：当 sandboxing + autoAllow 开启时，Bash 的 ask-rule 可以不触发 ask（走更宽松路径）。

- Kode：`packages/core/src/permissions/policies/bashTool.ts:36`
  - 当 sandbox plan 标记 `shouldAutoAllowBashPermissions` 且非 safeMode：走 `checkBashPermissionsAutoAllowedBySandbox(...)`，从而在 sandbox 约束内减少交互式权限摩擦。

### E4) 已知结构差异（仅列可复核差异）

- 官方：`cli.js:4553` 显示 `shouldAvoidPermissionPrompts` 位于 `toolPermissionContext`（`J.toolPermissionContext.shouldAvoidPermissionPrompts`）。
- Kode：`packages/core/src/permissions/engine.ts:48` 使用 `context.options?.shouldAvoidPermissionPrompts` 作为“prompts 不可用”信号（语义等价，但承载位置不同）。
