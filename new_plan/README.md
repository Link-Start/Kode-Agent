# Kode（vNext）全局最优结构设计文档集

本目录是一组“以不破坏任何既有对外行为”为前提的 **仓库结构升级 / 架构重构** 设计文档，用于把 Kode 从“CLI + 内部工具系统”的单体形态，演进为可复用的 **Core SDK + 多 Host（CLI / WebUI / VSCode / MCP / ACP）** 架构，同时保持：

- **对外兼容**：功能、流程、使用体验、外部调用方式、参数/协议/输出细节不变（新增能力必须默认关闭或完全不影响旧路径）。
- **性能与跨平台**：生产运行时以 Node.js 为基线（npm 用户不需要 Bun）；开发/构建/测试可使用 Bun，并确保 macOS/Linux/Windows 行为一致。
- **可测试**：单元/契约/集成/端到端（含构建产物 smoke）覆盖核心对外契约，作为重构护栏。

## 阅读顺序（推荐）

1. `new_plan/01_current_system.md`：当前系统拆解与关键流程（含 ≥20 个关键文件阅读清单）
2. `new_plan/02_target_architecture.md`：我最喜欢的“全局最优/最优雅”目标形态（分层、包边界、依赖规则、发布策略）
3. `new_plan/03_core_runtime.md`：Core（headless）引擎的内部运转模型与事件/会话抽象
4. `new_plan/04_tools_permissions.md`：工具系统与权限系统的解耦设计（从 React/Ink 依赖中抽离）
5. `new_plan/05_webui_daemon_vscode.md`：内置 WebUI + 本地 daemon + VSCode 扩展复用方案
6. `new_plan/06_testing_migration.md`：测试体系与迁移路线（阶段化落地、兼容策略、风险控制）
7. `new_plan/todo_tasks_detail.md`：可执行的任务拆解（面向 agent 的原子任务粒度 + 验收标准）

## 文档约定

- **“当前实现”** 指本仓库现状（以 `apps/kode/src/index.ts` 作为生产入口；构建产物为 `dist/index.js`）。
- **“目标形态”** 指建议的 vNext 架构，并不意味着已经在代码中实现。
- 若出现“可选/建议/未来”字样，默认都应以 **不改变既有默认行为** 为前提（例如 WebUI 默认不开启）。
