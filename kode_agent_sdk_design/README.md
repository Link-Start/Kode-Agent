# Kode Agent SDK 设计文档索引（vNext 主线 + MCP Kernels）

> 本目录产出的是“以 vNext 为主线”的 SDK 设计与升级方案，目标是同时服务：Kode CLI / VSCode 插件 / Browser Extension / Desktop / Next.js SaaS。

## 推荐阅读顺序

1) 先读需求与约束：`00_product_requirements_matrix.md`  
2) 再读历史问题复审：`00b_issues_reaudit.md`  
3) 再读两套实现审计与差异：`01_*`、`02_*`、`03_*`、`04_*`  
4) 再读 MCP Kernel 策略与安全蓝图：`05_*`、`06_*`  
5) 最后读目标架构与落地：`07_*`、`08_*`、`09_*`

## 文档列表（00~09）

- `kode_agent_sdk_design/00_product_requirements_matrix.md`：五端需求矩阵 + serverless/worker 边界结论  
- `kode_agent_sdk_design/00b_issues_reaudit.md`：对 `/Users/baicai/Desktop/MyT/Kode/Kode_SDK/issues.md` 的复审、优先级与修复落点  
- `kode_agent_sdk_design/01_vnext_architecture_audit.md`：vNext 架构审计（Runtime/Store/Sandbox/Tools/MCP/恢复封口）  
- `kode_agent_sdk_design/02_released_architecture_audit.md`：线上版本架构审计（事件协议/ToolResult/Provider/pending 可靠性等）  
- `kode_agent_sdk_design/03_vnext_vs_released_diff.md`：差异剖面与 2~3 条合并路线  
- `kode_agent_sdk_design/04_vnext_vs_released_decision.md`：主线决策（标准/权重/打分/结论/兼容策略）  
- `kode_agent_sdk_design/05_execution_kernel_mcp_strategy.md`：Execution Kernel MCP 化策略（McpSandbox/Kernel、隔离键、roots/elicitation/resources/progress/logging/prompts）  
- `kode_agent_sdk_design/06_security_isolation_blueprint.md`：安全/隔离/合规蓝图（symlink/roots、审批链路、quota、审计、SaaS 边界）  
- `kode_agent_sdk_design/07_kode_agent_sdk_100_design.md`：100 分目标架构（核心抽象、事件协议、并发、plan mode、五端 Host）  
- `kode_agent_sdk_design/08_integration_playbooks.md`：五端接入 playbooks（user flows + 事件流 + 审批 + roots + kernel 选择）  
- `kode_agent_sdk_design/09_action_plan_and_migration.md`：2~4 阶段落地计划（验收/风险/回滚/发布迁移）

## 术语对齐（防止后续实现“各写各的”）

- **Host**：UI 与权限呈现层（CLI/VSCode/Web/Browser/Desktop）。  
- **Runtime（SDK Core）**：对话编排 + tool loop + 事件流 + WAL/resume/seal + 策略与并发调度。  
- **Kernel（Execution Kernel）**：文件/终端/进程/守护/回滚等环境执行面，优先用 MCP 实现，并在内核侧做硬裁决。  
- **roots**：工作区边界（URI 列表），默认 deny-by-default。  
- **elicitation**：Kernel→Host 的交互请求（审批/问答/扩权），Host UI 必须承接。  
- **Session Isolation Key**：`tenantId + sessionId + workspaceRootHash + kernelId`（建议作为 MCP 连接/状态分片键）。  

## 未决疑点 / 下一步研究点

1) MCP SDK 对 server→client requests（roots/elicitation）与 notifications 的可靠性：不同 transport（stdio/SSE/WS）下重连/幂等行为需要验证。  
2) MCP `structuredContent` / `outputSchema` 的生态兼容性：是否必须同时提供“文本 JSON fallback”。  
3) VSCodeKernel 与 UnixToolsKernel 的边界：WorkspaceEdit/Terminal/Remote workspace 下如何做到语义一致且不绕过编辑器。  
4) Browser Extension 的隔离键设计：tab/frame 与 session 的绑定策略，以及页面权限（host permissions）审批 UX。  
5) plan mode 的最终形态：软约束（system reminder）与硬约束（kernel enforcement）的默认组合、退出审批 UX 细节。

## 相关补充文档（目录外）

- `unix_mcp.md`：Unix Coding Tools MCP 的通用设计（工具箱视角）  
- `agent_sdk.md`：面向任意 agent 主程序的 MCP client-side SDK 设计（协议能力补齐视角）

