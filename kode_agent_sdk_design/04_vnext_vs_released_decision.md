# 主线决策：vNext vs 线上已发布版本（2.7.x）

> 决策输入：  
> - `kode_agent_sdk_design/00_product_requirements_matrix.md`  
> - `kode_agent_sdk_design/00b_issues_reaudit.md`  
> - `kode_agent_sdk_design/01_vnext_architecture_audit.md`  
> - `kode_agent_sdk_design/02_released_architecture_audit.md`  
> - `kode_agent_sdk_design/03_vnext_vs_released_diff.md`  

## 0. 决策结论（直接回答）

**推荐以 vNext 为主线继续演进；线上已发布版本进入 LTS/Compat（冻结能力，仅做安全/隔离/P0 bugfix）。**

理由一句话版：vNext 已经完成“事件协议 + ToolResult 标准化 + 长任务可靠性（pending WAL）+ provider 体系化”的关键升级，这些都是支撑你五端产品与后续 MCP Kernel 化的硬前置；线上版若继续作为主线，最终也会被迫做同样的升级，等价于重复迁移且风险更高。

## 1. 决策标准、权重与打分

### 1.1 评分口径

- 评分：0~10（10 = 最符合长期目标）  
- 总分 = Σ（权重 × 得分）/10  
- 权重总计 100

### 1.2 标准与权重

1) **跨宿主复用性（30）**：事件协议可路由/可重放、Host 集成复杂度、Browser/VSCode/SaaS 的适配阻力  
2) **长任务可靠性（25）**：pending WAL、resume/seal、一致性与幂等、断线重连体验  
3) **长期演进扩展性（20）**：ToolResult/Policy 可扩展、provider 体系、抽取 Kernel 的可行性  
4) **迁移与生态成本（15）**：包名/版本策略、对现有调用方影响、compat 可行性  
5) **工程质量与可维护性（10）**：测试/覆盖率、文档与实现一致性、可观测性基建

### 1.3 打分表（含理由）

| 维度 | 权重 | vNext 得分 | 线上版得分 | 关键理由（摘要） |
| --- | ---:| ---:| ---:| --- |
| 跨宿主复用性 | 30 | 8 | 5 | vNext 统一 progress chunk + ToolResultPayload，更利于 UI/事件转发；线上版协议更碎且易扩散分支。 |
| 长任务可靠性 | 25 | 9 | 4 | vNext pending-messages WAL + restore；线上版 MessageQueue 仅内存，crash 丢消息风险高。 |
| 长期演进扩展性 | 20 | 7 | 5 | vNext provider registry + normalized stream + facade；两者 MCP 都需大修，但 vNext 基座更干净。 |
| 迁移与生态成本 | 15 | 6 | 8 | 线上版已发布且调用方可能依赖旧协议；vNext 需要 compat/迁移指南与包名统一。 |
| 工程质量与可维护性 | 10 | 8 | 6 | vNext lint+coverage+更多示例与质量门槛；线上版文档多但与实现存在关键不一致（pending WAL）。 |

**加权总分**

- vNext：`(30*8 + 25*9 + 20*7 + 15*6 + 10*8)/10 = 77.5`  
- 线上版：`(30*5 + 25*4 + 20*5 + 15*8 + 10*6)/10 = 53.0`

## 2. 取舍与“为什么不是双轨长期并存”

### 2.1 vNext 的主要代价

- 对外是一次“协议升级”：Progress/ToolResult/Agent.send 的签名变化会影响宿主集成与旧代码。  
- 包名存在漂移：`kode-agent-sdk` vs `@shareai-lab/kode-sdk` vs README `@kode/sdk`，需要强力收敛。

### 2.2 为什么不推荐长期双轨

长期双轨的真实成本是“每一次 P0 修复都要做两遍”，并且五端产品会被迫：
- 在 UI 层维护两套事件协议处理器
- 在审计/策略层维护两套 ToolResult 解析
- 在 SaaS 运行架构上承受两套恢复语义

这会显著拖慢 MCP Kernel 化与多产品统一底座的推进。

## 3. 兼容策略（包名 / 版本 / 迁移 / 去风险）

> 目标：对用户感受“尽量 0 影响”，但允许做**语义正确的 breaking change**（尤其是可靠性相关）。

### 3.1 包名收敛策略（推荐方案）

优先推荐：**以现有已发布包名为主（若生产已依赖）+ 发布 v3 大版本承载 vNext 内核**。

- `@shareai-lab/kode-sdk@3.0.0`（或 `@kode/sdk@3.0.0`，取决于你要的品牌/组织命名）  
  - 内部实现切换为 vNext 体系（progress chunk + ToolResultPayload + pending WAL + provider registry）  
  - 提供 `exports`/re-export 兼容旧入口（如仍需 `infra/provider` 的旧路径，可用 adapter 实现）
- `@shareai-lab/kode-sdk@2.7.x` 进入 LTS：只合并 P0 安全/隔离/错误映射补丁

备选：保留 `kode-agent-sdk` 作为“新主线包”，并提供 `@shareai-lab/kode-sdk-compat`（迁移成本更高，但命名更清晰）。

### 3.2 协议兼容（Compat Layer）

必须提供两个关键适配器（避免五端重复造轮子）：

1) `LegacyProgressAdapter`：把 vNext 的 `ProgressChunk` 映射为旧 `ProgressEvent`（text_chunk/tool:start/tool:end/done…），供旧 UI/调用方过渡。  
2) `LegacyToolResultAdapter`：把 `ToolResultPayload` 映射为旧 `{ ok, error, data, retryable, recommendations }` 形状；同时把旧 tool 返回值规范化为 `ToolResultPayload`（减少工具作者心智负担）。

### 3.3 迁移指南（最小破坏点）

迁移的本质就是三类改动：
- 事件处理：`progress` 从多事件 → 统一 chunk（或用 adapter）  
- 工具结果：从 `any`/`ok` → `ToolResultPayload`（或用 adapter）  
- send：从 sync → async（如果业务强依赖 sync，可临时提供 `sendSync` 但标注 deprecated）

### 3.4 去风险：分阶段上线

1) 先在 CLI（最接近 Node）落地 vNext 主线与 compat，验证协议与恢复语义；  
2) 再迁移 VSCode（重点验证 remote workspace 与事件转发）；  
3) SaaS 按“网关 serverless + agent-worker 常驻”部署，验证多租户隔离与恢复；  
4) Browser extension 最后接入（通常需要远端 kernel，且权限/隔离更复杂）。

## 4. 下一步（承接 SDK_T07~T12）

在确定“vNext 为主线”后，后续工作重点将从“选哪个版本”转为“如何把执行面抽到 MCP kernels 并做多租户隔离”：

- SDK_T07：Kernel（MCP）策略与哪些能力应留在 Agent/Host builtin  
- SDK_T08：安全/隔离/合规蓝图（roots、symlink、审计、配额、session isolation）  
- SDK_T09：100 分目标架构（Runtime/Kernel/Host 的最终边界）  

