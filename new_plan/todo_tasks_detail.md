# Todo Tasks（vNext 重构详细计划）

本计划面向“逐步重构到 `protocol + core + hosts` 架构”，要求 **不破坏任何既有行为**，并以测试护栏作为 gate。任务粒度以“一个 agent 一次能可靠完成”为准（原子性、可验收、可回滚）。

> 说明：当前仓库已经完成了一轮“结构下沉 + 契约/构建 smoke + 可达性分析 + 文档归档 + 跨平台解包优化 + CLI 子命令抽离”的任务（见根目录 `todo_tasks.json`）。本文件是在此基础上，规划下一阶段的“全局最优形态”升级路线。

## Progress Tracker（动态更新）

状态枚举：`pending` → `doing` → `to_review` → `to_test` → `success`

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| A1 | Workspace 目录骨架 | success | 已创建目录与 README；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| A2 | `protocol` 包 | success | 已新增 `packages/protocol/src/*` 并接入旧路径；新增协议契约测试；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| A3 | `runtime` 抽象接口 | success | 已新增 `packages/runtime/src/index.ts`（types only）并配置 `#runtime` paths；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| A4 | `runtime-bun` 实现 | success | 已新增 `packages/runtime-bun/src/index.ts` + `#runtime-bun` paths 与单测；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| A5 | `runtime-node` 实现 | success | 新增 `packages/runtime-node/src/index.ts`（Node.js 基线实现）+ 单测，并作为 SDK subpath export 输出到 `dist/sdk/runtime-node.*`；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| B1 | `AgentEvent` 模型 | success | 已在 `packages/protocol/src/agentEvent.ts` 定义 `AgentEventSchema`（对齐 stream-json）并补齐契约测试；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| B2 | Query 事件输出层 | success | 已新增 `packages/core/src/query/agentEvents.ts` 并导出 message→AgentEvent 转换与事件流包装；新增单测；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| B3 | Tool 三段式拆分 | success | 已新增 `packages/core/src/tooling/splitTool.ts`（ToolSpec/Runner/Presenter + splitLegacyTool）并补齐单测；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| B4 | Ink presenter 层 | success | 已新增 `ui/ink/src/toolPresenters/*` 并迁移 Glob/TaskOutput/KillShell 的 render*；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| B5 | 权限三层拆分 | success | 已拆分为 `packages/core/src/permissions/policy.ts`（决策）+ `packages/core/src/permissions/store.ts`（持久化）+ `packages/core/src/permissions/permissionKey.ts`（key 生成），并保持导出面不变；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| C1 | CLI host 纯 I/O+渲染 | success | 已新增 `packages/core/src/engine/*`（systemPrompt/turn）并让 REPL + print mode 通过 `runTurn` 执行；`bun test`/`bun run build`/`bun run typecheck` 全绿；`--help-lite`/CLI `--help` 与 old_version_2 输出一致 |
| C2 | ACP 复用 engine | success | ACP session 执行改为复用 `#core/engine`（systemPrompt/context/runTurn）；新增 in-memory ACP contract tests；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| C3 | MCP 复用 ToolSpec | success | MCP `tools/list` 的 schema/description 生成抽到 `packages/core/src/tooling/mcpToolSchema.ts`（基于 ToolSpec），并在 `apps/kode/src/entrypoints/mcpServer.ts` 复用；新增 MCP stdio `tools/list` 集成测试；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| D1 | daemon app | success | 新增 Node-compatible daemon：`packages/daemon/src/server.ts`（HTTP `/health` + token-gated `/api/health` + WS `/ws` 流式 AgentEvent）；新增 `apps/kode/src/entrypoints/daemon.ts` 并接入构建产物 `dist/entrypoints/daemon.js`；新增 daemon 集成测试（echo 模式）；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| D2 | WebUI 打包进 dist | success | 新增 `ui/web` 静态 WebUI（无依赖、WS 连接 daemon）；daemon 支持静态托管；`bun run build` 会拷贝到 `dist/webui`；新增集成测试覆盖静态资源与 build 产物；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| D3 | CLI `--web` | success | CLI 增加 `--web/--web-host/--web-port`（仅交互模式，默认 `--help` 隐藏以保持兼容）；启动时拉起 daemon 并把 WebUI URL 显示在 TUI Logo 区域；退出自动 stop；新增 `--web --print` 拒绝测试；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| D4 | WebUI 体验（高质量本地交互） | success | WebUI 新增 Git 面板（status/diff/stage/commit）、xterm 终端、CodeMirror 语法高亮编辑器与移动端侧边栏；daemon WS 新增 git_* 消息并复用权限 gating；新增 `packages/core/src/test/integration/daemon-git.test.ts`；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| E1 | daemon client SDK | success | 新增 daemon client SDK：`packages/daemon/src/client.ts`（Bun/Node：优先 global WebSocket，fallback undici.WebSocket；AsyncIterable 事件流）；新增集成测试覆盖 echo daemon 下的连接/发 prompt/收 AgentEvents；`bun test`/`bun run build`/`bun run typecheck` 全绿 |
| E2 | VSCode PoC（独立仓库） | success | `examples/vscode` 提供可抽离 PoC：仅 UI + 连接/嵌入 daemon WebUI（不重实现 core/tools），可复制到新 repo 后按 README 用 F5 启动 |
| F1 | SDK 文档与示例 | success | 新增 `docs/sdk/README.md` + `examples/daemon-client-echo.ts`（daemon+client 使用说明/最小示例，强调 opt-in） |
| F2 | semver/弃用策略 | success | 新增 `docs/versioning.md`（public surface/semver/breaking/弃用流程）并接入 `docs/README.md` 导航 |
| G1 | Core 去 UI 化（messages） | success | `packages/core/src/utils/messages.ts` 已移除 Ink/React/组件依赖；`processUserInput` 归档到 `ui/ink/src/utils/processUserInput.tsx` 并更新所有引用；新增 headless 断言测试 |
| G2 | Core 去 UI 化（Tool React runtime） | success | `packages/core/src/tooling/Tool.ts` 改为 `import type`（移除运行时 React import），不改 Tool 接口与行为；测试/构建全绿 |
| G3 | Core 去 UI 化（binary feedback） | success | 新增 `packages/core/src/feedback/binaryFeedback.ts` 并让 `packages/core/src/query` 改用 core 依赖；`ui/ink/src/components/binary-feedback/utils.ts` 保留兼容 re-export；测试/构建全绿 |
| H1 | Packages 化 core | success | `src/core` → `packages/core/src`；`@core` alias 指向 `packages/core/src`；更新 `src/query.ts`/`src/context.ts`/`src/permissions.ts`/`src/tools.ts`/`src/Tool.ts` 兼容导出；`bun test`/`typecheck`/`build` 全绿且 help/version 与 old_version_2 字节级一致 |
| I1 | Packages 化 daemon | success | `src/daemon/*` → `packages/daemon/src/*`，保留兼容 re-export；新增 `@daemon` alias；修复 WebUI 自动探测在新路径下仍可用 |
| I2 | Packages 化 host-acp | success | `src/acp/*` → `packages/host-acp/src/*`，保留兼容 re-export；新增 `@host-acp` alias；ACP 协议与 stdout guard 保持不变 |
| I3 | Packages 化 host-mcp | success | `src/entrypoints/mcpServer.ts` → `packages/host-mcp/src/*`（server）；保留 entrypoints re-export；新增 `@host-mcp` alias |
| I4 | Packages 化 tools-builtin（入口） | success | ✅ 已将内置工具注册表从 core 下沉至 `packages/tools-builtin/src/registry.ts`（core 不再直接依赖内置 tools）；内部导入使用 `#tools-builtin/*`；工具顺序不变 |
| I5 | Packages 化 host-cli（入口） | success | `src/app/entrypoints/cli/*` → `packages/host-cli/src/app/entrypoints/cli/*`，保留兼容 re-export；新增 `@host-cli` alias |
| I6 | Apps 化 hosts 入口 | success | `apps/*` 不再仅 README，占位入口迁移落地；入口/构建已统一到 `apps/kode`（`dist/index.js` + `dist/entrypoints/*`） |
| I7 | 根目录 `src/` 消解 | success | RF046 ✅：build/dev/test 入口迁移至 `apps/kode`；RF047 ✅：彻底移除根目录 `src/`（源码分布统一为 `apps/*` + `packages/*` + `ui/*`）；RF048 ✅：清理遗留引用/占位目录并确保测试/构建全绿 |
| I8 | Packages 化 tools-builtin（实现） | success | legacy tools 实现统一归档至 `packages/tools-builtin/src/tools/**`；内部导入统一为 `#tools-builtin/*`；测试/构建 gate 全绿 |
| I9 | UI 分层（Ink） | success | Ink UI 统一归档至 `ui/ink/src/*`（components/screens/ui/hooks/context）；内部导入使用 `#ui-ink/*`（`tsconfig.json` paths）；测试/构建 gate 全绿 |
| I10 | Packages 化 config | success | 配置系统实现归档至 `packages/config/src/index.ts`；`@config` alias 可用；core/hosts 改用 `@config`；测试/构建 gate 全绿 |
| I11 | Entrypoints 统一与去重 | success | 入口/构建统一到 `apps/kode/src/entrypoints/*`（输出 `dist/entrypoints/*`），并清理重复/混淆入口；保持 CLI/ACP/MCP/daemon 行为不变 |
| I12 | 仓库清理（文档归档） | success | 将根目录无关设计稿迁入 `docs/_archive/2025-12/`，保持根目录更干净 |
| I13 | 大小写一致性（跨平台） | success | `tsconfig.json` 启用 `forceConsistentCasingInFileNames=true` 并修复潜在大小写不一致 import（无行为改动） |
| I14 | 移除 `packages/kode/`（禁止过渡态） | success | 彻底删除 `packages/kode`；实现迁移至 `packages/core` + `ui/ink` + `packages/host-cli` + `packages/runtime-bun`；`bun test`/`typecheck`/`build` 全绿；`new_plan`/`docs/develop` 不再引用旧路径 |

## Post-plan hygiene（仓库洁癖收尾）

| ID | 任务 | 状态 | 备注 |
| --- | --- | --- | --- |
| J1 | 删除 `apps/mcp-server` 占位 | success | 该目录仅 re-export 且不参与构建；保留 `apps/kode/src/entrypoints/mcp.ts` 作为真实入口，行为不变 |
| J2 | VSCode PoC 迁移到 `examples/` | success | `apps/vscode` → `examples/vscode`，避免 `apps/*` 混入非可执行 PoC；不影响发布产物 |
| J3 | 文档结构对齐与去误导 | success | 修正旧路径示例、重写 `docs/system-design.md`（短版）并归档历史深度解析 |
| J4 | 测试临时目录清理 | success | 测试临时目录改用 `os.tmpdir()` 并清理，避免污染仓库根目录 |
| J5 | 根目录本地临时目录清理 | success | 已清理根目录残留的本地临时目录；`bun run clean` 不再告警 |

## A. 目标结构落地（workspace/包边界）

### A1. 引入 workspace 目录骨架（不搬代码）

- 任务：新增 `apps/`、`packages/`、`ui/` 目录骨架与 README（仅占位，不改变运行）
- 依赖：无
- 验收：`bun test`、`bun run build`、`bun run typecheck` 全绿

### A2. 定义 `protocol` 包（先搬 schema，不改逻辑）

- 任务：从 `src/utils/protocol/*` 抽取 “纯类型/纯 schema” 到 `packages/protocol`
- 依赖：A1
- 验收：原路径保留兼容 re-export；协议相关 contract tests 全绿

### A3. 定义 `runtime` 抽象接口（仅定义 types）

- 任务：新增 `packages/runtime`：定义 fs/spawn/env/cwd/clock/log 接口
- 依赖：A1
- 验收：不改任何调用点，仅新增 types；typecheck 通过

### A4. 新增 `runtime-bun`（最小实现 + 单测）

- 任务：实现 runtime-bun，覆盖 core 当前真正需要的子集（readFile/writeFile/spawn 等）
- 依赖：A3
- 验收：新增单元测试覆盖 Windows/macOS/Linux 分支（通过 mock + path fixtures）

## B. Core headless 化（去 UI 依赖）

### B1. 抽象事件模型 `AgentEvent`（protocol）

- 任务：在 `packages/protocol` 定义 `AgentEvent` union schema（对齐现有 stream-json）
- 依赖：A2
- 验收：新增协议 schema contract tests；旧 stream-json 输出保持兼容

### B2. 为现有 query pipeline 添加“事件输出层”

- 任务：在不改变行为的前提下，让核心流程同时可产出 `AgentEvent`（先内部使用）
- 依赖：B1
- 验收：不改变现有 CLI/print 输出；新增单元测试验证 event 序列与关键字段

### B3. Tool 接口三段式拆分（Spec/Runner/Presenter）

- 任务：在 core 新增 `ToolSpec/ToolRunner` 类型，并提供 adapter 包装旧 Tool
- 依赖：B2
- 验收：现有工具/CLI 输出完全不变；工具契约测试全绿

### B4. 将“ReactNode 渲染”移动到 Ink presenter（渐进迁移）

- 任务：建立 `ui/ink` presenter 层：把现有 `renderToolUseMessage/renderToolResultMessage` 迁移出去（优先 3 个代表工具）
- 依赖：B3
- 验收：CLI 视觉输出与交互行为不变（使用 snapshot-less 断言关键片段/结构）

### B5. 权限三层拆分（Policy/Broker/Store）

- 任务：抽出纯逻辑 policy；把 UI prompt 变成 host 回调/事件
- 依赖：B2
- 验收：CLI 权限对话框与决策逻辑不变；ACP/headless 模式默认 fail-closed

## C. Hosts：CLI/ACP/MCP 统一到“同一个 core”

### C1. CLI host 仅负责 I/O + 渲染

- 任务：把 CLI 入口里直接依赖 core 的细节，改为调用 core engine API（内部 adapter）
- 依赖：B2、B3、B5
- 验收：CLI contract tests（help、print、tools list）完全不变

### C2. ACP host 复用同一套 engine（避免重复）

- 任务：重构 ACP handler 仅做 RPC <-> engine 的适配
- 依赖：B2、B1
- 验收：新增 ACP 协议契约测试（method/params/response schema）；现有 ACP 行为不变

### C3. MCP host 复用 tools spec（工具列举统一）

- 任务：MCP server 使用 ToolSpec 输出 schema（避免重复生成/不一致）
- 依赖：B3、A2
- 验收：MCP tool 列表与 schema 不变（新增 contract tests）

## D. Daemon + WebUI（默认关闭，opt-in）

### D1. 新增 daemon app（本地 HTTP/WS 服务）

- 任务：实现 daemon entrypoint：启动 engine，提供 WS event stream + HTTP 控制面（入口在 `apps/kode/src/entrypoints/daemon.ts`）
- 依赖：B2、B5、A4
- 验收：daemon 单测（启动、health、token 校验）；不影响现有 CLI

### D2. 引入 WebUI 项目（Vite）并打包到 dist

- 任务：新增 `ui/web`（Vite + 静态资源托管），build 产物进入 `dist/webui`
- 依赖：D1
- 验收：`bun run build` 产物包含 webui；daemon 可正确托管静态文件

### D3. CLI 新增 `--web`/`web` 命令（默认关闭）

- 任务：在 CLI 增加可选开关：启动 daemon 并输出 URL
- 依赖：D1、D2
- 验收：默认 `kode` 输出/行为不变；`kode --web` 功能可用且有集成测试

## E. VSCode 扩展（独立仓库，但复用协议/客户端）

### E1. 发布 client SDK（连接 daemon）

- 任务：在 `packages/host-acp` 或 `packages/protocol` 中提供轻量 client（WS/HTTP）
- 依赖：D1、B1
- 验收：client 单测覆盖 reconnect、事件解码、错误处理

### E2. VSCode extension PoC（单独仓库）

- 任务：扩展只做 UI + 启动/连接 daemon，不重复实现 core/tools
- 依赖：E1
- 验收：最小闭环：输入 prompt -> 接收事件 -> 渲染回答（不要求全功能）

## F. 文档/示例与长期维护

### F1. 对外 SDK 文档（core/protocol）

- 任务：编写 `docs/sdk/`：如何在 WebUI/VSCode/脚本中使用 core/daemon
- 依赖：B2、D1
- 验收：示例可运行（无网络依赖的 dry-run 示例）

### F2. 兼容与弃用策略（semver）

- 任务：定义“何时允许 breaking change”的政策；新增 deprecation warning 机制（默认关闭）
- 依赖：C1
- 验收：README/CHANGELOG 说明清晰；不影响默认输出

## 验收清单（每个阶段都必须满足）

- `bun test` 全绿
- `bun run typecheck` 全绿
- `bun run build` 产物可执行（smoke tests）
- 无网络依赖（除非明确标注为 opt-in）
- 外部接口不变（CLI help/参数/输出关键片段；tools list；protocol schema）
