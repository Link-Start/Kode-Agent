# 05｜内置 WebUI + Daemon + VSCode：复用 Core 的最佳路径

本文件回答三个问题：

1. Kode 如何“内置一个 WebUI 前端项目”，随包发布并由本地 localhost 访问？
2. 如何在不影响现有 CLI 的前提下新增该能力？
3. VSCode 扩展如何作为独立仓库，但高度复用 Kode（避免重复实现）？

## 1. 推荐产品形态（不破坏默认行为）

建议新增一条“可选路径”，默认关闭：

- `kode`：保持现有 TUI 交互（不新增额外输出）
- `kode --web` 或 `kode web`：
  - 启动本地 daemon（若未启动）
  - 打印一行 `http://localhost:<port>/...`（第一行）
  - 同时仍可在终端交互（可选：TUI 内显示状态/二维码）

这样满足：

- 默认体验完全不变（不破坏脚本/截图/习惯）
- 新能力可按需开启，并且可做成“一键点击访问”

## 2. Daemon 的职责与边界（host-daemon）

daemon 是 “headless host + 多客户端桥接层”：

- 常驻进程（提升性能、缓存 tools schema、复用模型连接）
- 暴露 API（HTTP/WS/SSE），让 WebUI/VSCode/CLI 作为客户端连接
- 托管静态 WebUI（build 后的 dist 资源）
- 维护 session 列表、最近会话、日志目录与诊断信息

daemon 不做：

- 不实现 UI（UI 在 Web/CLI/VSCode）
- 不重复实现 core 的业务决策（权限、工具执行、编排都在 core）

## 3. WebUI 集成方式（Vite + 静态资源托管）

推荐引入一个独立的 `ui/web/`（Vite 项目），构建产物被拷贝到：

- `dist/webui/`（随 npm 包发布）

daemon 启动时：

- 静态资源：`GET /` -> `dist/webui/index.html`
- API：`/api/v1/*`

API 形式建议：

- **WebSocket**：用于 `AgentEvent` 流（与 stream-json 对齐）
- **HTTP**：用于一次性请求（列工具、读 session、导出日志）

## 4. 与 ACP 的关系（统一而不是重复）

现有 ACP 已经是一个非常适合“外部客户端连接”的协议形态（JSON-RPC over stdio）。

建议：

- `packages/host-acp` 定义 ACP 的方法与 schema（放到 `protocol`）
- daemon 提供两种模式（至少一种）：
  1) 直接内嵌 ACP peer（WS/HTTP 上跑 ACP 的 method 语义）
  2) 或复用 ACP handler，把 transport 换成 WS

原则：WebUI/VSCode/CLI 客户端与 core 之间，尽可能共享同一套“请求/事件”模型。

## 5. VSCode 扩展（独立仓库）如何复用

强烈建议 VSCode 扩展作为独立仓库，但复用 Kode 的方式是：

### 路径 A（推荐）：扩展只做客户端，连接本地 daemon

- 扩展启动：检查 daemon 是否运行；未运行则 spawn `kode daemon`（或 `kode --daemon`）
- 通过 WS/HTTP/ACP 与 daemon 交互
- 扩展 UI（chat panel、diff view）只消费 `AgentEvent`

优点：

- VSCode 运行在 Node；daemon/engine 以 Node.js 运行时为基线（不依赖 Bun），并可选提供单文件原生二进制分发
- 避免在 extension 里打包/兼容大量原生依赖与工具执行细节

### 路径 B（可选）：在 extension 进程内直接跑 core（Node runtime）

- 需要 `runtime-node` 实现与大量兼容性工作
- 仅适用于“极轻量能力”或离线场景

## 6. 安全与隐私（本地服务必须做的事）

daemon 必须：

- 默认只绑定 `127.0.0.1`/`localhost`
- 使用一次性 token（URL query 或 header）避免同机其他进程随意访问
- 明确 CORS 策略（默认 same-origin）
- 记录最小必要日志，避免泄露 prompt/代码（或提供脱敏选项）

## 7. “CLI + WebUI 同时可用”的交互建议

两种可选策略：

1. **双前端同会话**：CLI 与 WebUI 同时订阅同一个 session 的事件流（需要会话锁与输入仲裁）
2. **分会话**：WebUI 启动后默认新建 session；CLI 不自动共享（实现更简单，风险更低）

建议先落地“分会话”，后续再做“同会话协作”。
