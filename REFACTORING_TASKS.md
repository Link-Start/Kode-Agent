# Kode 重构任务清单

> 基于 REFACTORING_BLUEPRINT.md 的剩余工作

---

## 当前状态

- 目录骨架: 85% 完成
- 核心解耦: 50% 完成
- 文件拆分: 40% 完成
- **整体完成度: ~65%**

---

## Phase 1: 移动 commands 到 apps/cli

**目标**: commands 是 CLI 特有逻辑，不应在 packages/core

### Task 1.1: 迁移 commands 目录

```yaml
从: packages/core/src/commands/
到: apps/cli/src/commands/

涉及文件:
  - packages/core/src/commands/index.ts
  - packages/core/src/commands/builtin/
  - packages/core/src/commands/agent/
  - packages/core/src/commands/mcp/
  - packages/core/src/commands/plugin/
  - packages/core/src/commands/debug/
```

### Task 1.2: 迁移 commands.ts

```yaml
从: packages/core/src/commands.ts
到: apps/cli/src/commands/registry.ts
```

### Task 1.3: 更新导入路径

所有 `from '@kode/core/commands'` 改为相对路径导入

---

## Phase 2: 拆分 packages/core/src/services

**目标**: services/ 当前 5904 行，需按职责拆分

### Task 2.1: 创建 packages/core/src/ai/ 目录

```yaml
移动:
  - services/llm.ts → ai/llm.ts
  - services/llmLazy.ts → ai/llmLazy.ts
  - services/llmConstants.ts → ai/constants.ts
  - services/modelAdapterFactory.ts → ai/modelAdapterFactory.ts
  - services/adapters/ → ai/adapters/
  - services/ai/ → ai/ (合并)
  - services/openai/ → ai/openai/
```

### Task 2.2: 保留 services/ 的轻量服务

```yaml
保留在 services/:
  - notifier.ts (926 行)
  - oauth.ts (需要)
  - statusline.ts (56 行)
  - responseStateManager.ts (小)
  - vcr.ts (161 行)
```

### Task 2.3: 移动到 apps/cli 的服务

```yaml
移动到 apps/cli/src/services/:
  - services/customCommands.ts (1081 行) - CLI 特有
  - services/skillMarketplace.ts (1385 行) - CLI 特有
  - services/outputStyles.ts (560 行) - CLI 特有
  - services/mentionProcessor.ts - CLI 特有
```

### Task 2.4: 移动到 packages/config 的服务

```yaml
移动到 packages/config/src/:
  - services/gpt5ConnectionTest.ts → packages/config/src/connectionTest.ts
```

### Task 2.5: 删除空壳文件

```yaml
删除:
  - services/kodeContext.ts (仅 37 字节)
  - services/llmConstants.ts (仅 35 字节)
  - services/sentry.ts (仅 112 字节，空实现)
  - services/mcpClient.ts (仅 36 字节)
  - services/openai.ts (仅 31 字节)
  - services/pluginValidation.ts (仅 41 字节)
  - services/systemReminder.ts (仅 39 字节)
```

---

## Phase 3: 拆分 packages/core/src/utils

**目标**: utils/ 当前 15689 行，需按职责拆分

### Task 3.1: 移动到 packages/runtime

```yaml
移动:
  - utils/BunFile.ts → packages/runtime/src/file.ts
  - utils/BunShell.ts (1845 行) → packages/runtime/src/shell.ts
  - utils/BunSearcher.ts → packages/runtime/src/searcher.ts
```

### Task 3.2: 移动到 packages/config

```yaml
移动:
  - utils/config.ts → packages/config/src/utils.ts
  - utils/settingSources.ts → packages/config/src/sources.ts
  - utils/settingsFiles.ts → packages/config/src/files.ts
  - utils/localSettings.ts → packages/config/src/local.ts
  - utils/modelConfigYaml.ts → packages/config/src/modelYaml.ts
```

### Task 3.3: 移动到 apps/cli

```yaml
移动到 apps/cli/src/utils/:
  - utils/Cursor.ts - CLI 特有
  - utils/terminal.ts - CLI 特有
  - utils/externalEditor.ts - CLI 特有
  - utils/completion/ - CLI 特有
  - utils/promptInputSpecialKey.ts - CLI 特有
  - utils/replStaticSplit.ts - CLI 特有
```

### Task 3.4: 移动到 packages/protocol

```yaml
移动:
  - utils/protocol/ → packages/protocol/src/utils/
```

### Task 3.5: 保留在 core/utils 的通用工具

```yaml
保留:
  - utils/errors.ts
  - utils/json.ts
  - utils/uuid.ts
  - utils/array.ts
  - utils/tokens.ts
  - utils/format.tsx
  - utils/markdown.ts
  - utils/diff.ts
  - utils/git.ts
  - utils/file.ts
  - utils/http.ts
  - utils/env.ts
  - utils/user.ts
  - utils/validate.ts
```

---

## Phase 4: 拆分超大文件

**目标**: 所有文件 < 400 行

### Task 4.1: 拆分 bashToolPermissionEngine.ts (2617 行)

```yaml
文件: packages/core/src/utils/permissions/bashToolPermissionEngine.ts

拆分为:
  permissions/bash/
  ├── index.ts           # 导出
  ├── engine.ts          # 主逻辑 (<400行)
  ├── rules.ts           # 规则定义
  ├── matchers.ts        # 命令匹配器
  ├── validators.ts      # 验证器
  └── types.ts           # 类型定义
```

### Task 4.2: 拆分 kodeHooks.ts (1829 行)

```yaml
文件: packages/core/src/utils/kodeHooks.ts

拆分为:
  hooks/
  ├── index.ts           # 导出
  ├── registry.ts        # Hook 注册
  ├── executor.ts        # Hook 执行
  ├── lifecycle.ts       # 生命周期 hooks
  ├── tool.ts            # 工具相关 hooks
  └── types.ts           # 类型定义
```

### Task 4.3: 拆分 debugLogger.ts (1261 行)

```yaml
文件: packages/core/src/utils/debugLogger.ts

拆分为:
  logging/
  ├── index.ts           # 导出
  ├── logger.ts          # 主日志器
  ├── formatters.ts      # 格式化器
  ├── transports.ts      # 输出目标
  └── levels.ts          # 日志级别
```

### Task 4.4: 拆分 model.ts (1017 行)

```yaml
文件: packages/core/src/utils/model.ts

拆分为:
  model/
  ├── index.ts           # 导出
  ├── manager.ts         # 模型管理
  ├── selector.ts        # 模型选择
  ├── capabilities.ts    # 能力检测
  └── types.ts           # 类型定义
```

### Task 4.5: 拆分 agentLoader.ts (938 行)

```yaml
文件: packages/core/src/utils/agentLoader.ts

拆分为:
  agent/
  ├── index.ts           # 导出
  ├── loader.ts          # 加载逻辑
  ├── validator.ts       # 验证逻辑
  ├── storage.ts         # 存储逻辑
  └── types.ts           # 类型定义
```

---

## Phase 5: 清理和验证

### Task 5.1: 删除空目录和遗留文件

```yaml
检查并删除:
  - 空的 index.ts 重导出文件
  - 未使用的类型定义
  - 重复的工具函数
```

### Task 5.2: 更新所有 package.json 依赖

```yaml
确保:
  - apps/cli 依赖 @kode/core, @kode/client
  - apps/server 依赖 @kode/core, @kode/protocol
  - apps/web 依赖 @kode/client, @kode/protocol
  - packages/client 依赖 @kode/protocol
  - packages/core 依赖 @kode/protocol, @kode/tools, @kode/config, @kode/runtime
```

### Task 5.3: 运行完整测试

```bash
pnpm typecheck
pnpm test
pnpm build
```

### Task 5.4: 验证 SDK exports

```bash
# 确保以下导入正常工作
import { ... } from '@shareai-lab/kode/core'
import { ... } from '@shareai-lab/kode/protocol'
import { ... } from '@shareai-lab/kode/client'
import { ... } from '@shareai-lab/kode/tools'
import { ... } from '@shareai-lab/kode/runtime'
```

---

## 执行顺序建议

```
Phase 1 (commands 迁移)
    ↓
Phase 2 (services 拆分)
    ↓
Phase 3 (utils 拆分)
    ↓
Phase 4 (大文件拆分)
    ↓
Phase 5 (清理验证)
```

每个 Phase 完成后:
1. 运行 `pnpm typecheck`
2. 运行 `pnpm test`
3. 运行 `pnpm dev:cli` 验证 CLI 正常
4. 提交代码

---

## 不在本次重构范围

- [ ] apps/vscode - 待规划，可能独立仓库
- [ ] apps/desktop - 待规划，可能独立仓库

---

## 完成标准

- [ ] packages/core/src/services/ < 2000 行
- [ ] packages/core/src/utils/ < 5000 行
- [ ] 单文件最大 400 行
- [ ] apps/cli 包含所有 CLI 特有逻辑
- [ ] packages/core 只包含核心引擎逻辑
- [ ] 所有测试通过
- [ ] CLI/Server/Web 正常运行

---

*创建时间: 2024-12-31*
