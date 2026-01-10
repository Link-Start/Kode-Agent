# 06｜测试体系与迁移路线（确保不破坏任何行为）

本文件给出 vNext 重构的“护栏设计”：哪些行为必须冻结？如何分层测试？如何阶段化迁移并随时可回滚？

## 1. 测试金字塔（推荐配比）

1. **契约测试（contract）**：冻结对外行为（CLI help、工具列表、协议 schema、构建产物可执行）
2. **单元测试（unit）**：core/protocol/runtime 的纯逻辑（无需网络、无需真实 home）
3. **集成测试（integration）**：spawn 子进程运行关键入口（`dist/index.js`、print 模式、ACP 交互最小回路）
4. **端到端（e2e）**：在可控环境中验证“从输入到输出”的关键用户路径（优先覆盖非交互/print）

## 2. 必须冻结的外部契约清单

### CLI 契约

- `kode --help`（关键片段/命令顺序/参数默认值/aliases）
- `kode --help-lite`、`kode --version`（启动性能与脚本兼容）
- `kode mcp ...` / `kode context ...` / `kode config ...` / `kode models ...` 等子命令 help

### 工具契约

- `getAllTools()` 工具列表与顺序
- 关键工具的 name/aliases、schema、readOnly/concurrencySafe 判定

### 协议契约

- stream-json event 结构
- session jsonl entry 结构
- ACP JSON-RPC 方法与参数/返回结构

### 构建产物契约

- `bun run build` 产物可执行（不挂起、不触网）
- wrapper（`cli.js` / `cli-acp.js`）行为不变

## 3. 迁移策略（阶段化 + 兼容层）

### Phase 0：建立护栏（tests first）

- contract tests + build smoke tests
- reachability 分析脚本（只报告不可达，不删除）

### Phase 1：结构下沉但保持 import 面不变

- 把 core/tooling/permissions/context/query 等移到 `packages/core/src/*`
- 旧入口文件保留 re-export（避免对外 import break）
- 引入路径别名（`#core/#config/#protocol/#tools-builtin/#ui-ink`）

### Phase 2：解耦 Tool & Permission（核心里去 React）

关键交付：

- 新 event 型 ToolRunner + Presenter 架构（见 `new_plan/04_tools_permissions.md`）
- CLI 使用 Ink presenter 保持完全一致输出
- ACP/MCP/daemon 使用文本或结构化 presenter

### Phase 3：引入 daemon + WebUI（默认关闭）

- `kode --web`/`kode web` 启动 daemon 并打印 URL
- 打包内置 WebUI 静态资源
- WebUI 通过 WS 消费 `AgentEvent`

### Phase 4：VSCode 扩展（独立仓库）

- 以 daemon 为后端（Node.js 运行时基线 + 可选原生二进制分发）
- 共享 `protocol` 包与客户端 SDK

## 4. 风险控制与回滚策略

- **每一步都可回滚**：通过 re-export/compat layer，确保目录迁移不影响 import
- **默认行为不变**：新增功能必须 opt-in（CLI 输出/交互保持原样）
- **Fail-closed**：权限与 gate（尤其 Bash）在无 UI 场景默认拒绝
- **跨平台 CI**：至少 macOS + Linux + Windows 的关键测试集（contract + unit + build smoke）

## 5. 性能验证（建议指标）

- `--help-lite` 冷启动时间（对比基线）
- `kode` 进入交互界面耗时（加载 Ink 前后）
- daemon 模式下二次请求延迟（复用进程/缓存工具 schema）
- tool 执行吞吐（并发安全工具并行执行）
