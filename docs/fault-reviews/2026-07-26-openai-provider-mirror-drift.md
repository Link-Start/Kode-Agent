# 故障复盘：OpenAI 流式实现镜像未同步

## 基本信息

| 字段          | 内容                                                     |
| ------------- | -------------------------------------------------------- |
| 日期          | 2026-07-26                                               |
| 发现人        | 全仓回归测试                                             |
| 严重程度      | P2-一般                                                  |
| 影响范围      | 当前严格类型迁移工作树；阻断全仓测试通过，未进入发布产物 |
| 关联 Issue/PR | 无                                                       |
| 关联提交      | 未提交                                                   |

## 1. 问题描述

### 1.1 问题场景

在严格类型迁移审计中，`packages/core` 的 OpenAI 流式响应重组逻辑被加固：不再以非空断言读取流元数据，并将重组响应的 `object` 固定为 `chat.completion`。

### 1.2 具体表现

`packages/core` 与 `packages/ai` 的 OpenAI LLM 文件是受镜像边界测试约束的双实现。修复前，初次改动只落在 core 侧，导致首次全仓回归中的镜像一致性测试失败，其余 426 个测试文件通过。将改动同步到 AI 侧后，修复后的全仓回归为 427/427 个测试文件通过。

### 1.3 修复前的错误信息

```text
packages/core/src/test/unit/openai-provider-mirror.test.ts
error: stream.ts
Expected mirrored OpenAI stream implementations to be equivalent
Workspace test summary: 426 passed files, 1 failed files
```

## 2. 临时解决方案

无。问题在合入前的回归阶段发现，没有采用关闭测试或放宽类型规则的临时绕过方案。

## 3. 根本原因分析

### 3.1 问题分析过程

1. 修复前的 `bun run typecheck` 通过，说明严格类型配置和局部类型安全改动本身没有诊断错误。
2. 修复前首次 `bun run test` 仅失败于 `openai-provider-mirror.test.ts`，其 diff 指向 `stream.ts` 的函数签名、元数据收集和响应对象字段。
3. 检查镜像测试可知，它在归一化包内导入差异后直接比较两侧源码（`packages/core/src/test/unit/openai-provider-mirror.test.ts:183`）。
4. 对比两个 `stream.ts` 确认：core 侧已有安全改动，AI 侧仍是旧实现；因此是同步遗漏，不是运行时断言或测试夹具问题。
5. 将同一语义改动同步到 AI 侧、保留包内导入差异后，镜像测试和类型检查均通过；修复后的完整 `bun run test` 为 427/427 个测试文件通过。

### 3.2 直接原因

修改只落在 `packages/core/src/ai/llm/openai/stream.ts:135`，未同步到镜像文件 `packages/ai/src/llm/openai/stream.ts:135`。

### 3.3 根本原因

- **设计层面**：两份实现需要保持源码等价，但文件结构本身无法自动传播改动。
- **开发层面**：修复按目录分配时，core 侧完成后未立即识别该文件属于镜像对。
- **流程层面**：虽已有镜像一致性测试，但首次局部验证只运行了流式响应测试，未同时运行镜像边界测试。

### 3.4 为什么没有提前发现

- 类型检查无法检测跨文件的源码镜像约束。
- 局部 `openai-stream-abort` 测试覆盖了流式行为，但不覆盖双包同步。
- 全仓回归会覆盖该约束，因而在发布前阻断了问题。

## 4. 解决方案

### 4.1 根本解决方案

将以下类型安全逻辑同步至两个镜像文件，并保留各自包内导入：

- 使用 `AsyncIterable<OpenAI.ChatCompletionChunk>` 表达输入流；
- 显式验证 `id`、`created`、`model` 后再构造响应；
- 对重组后的响应使用规范的 `object: 'chat.completion'`；
- 对可选 usage 使用显式空值判断。

**修改文件**：

- `packages/core/src/ai/llm/openai/stream.ts:135`
- `packages/ai/src/llm/openai/stream.ts:135`

**方案说明**：同步镜像源文件而非放宽镜像测试，既保留 core/AI 的行为等价约束，也保留严格类型修复带来的运行时元数据校验。

### 4.2 影响范围评估

影响仅限 OpenAI 流式响应重组和镜像源码一致性。修复前的完整工作区测试为 426 个测试文件通过、1 个失败；修复后全仓类型检查通过，完整工作区测试为 427/427 个测试文件通过，未发现其他回归。

## 5. 预防措施

### 5.1 代码层面

- [x] 修改 `packages/core/src/ai/llm/openai/` 文件时，同步检查 `packages/ai/src/llm/openai/` 对应文件。
- [ ] 在相关目录加入简短维护说明，标出镜像文件对及允许的包内导入差异。

### 5.2 测试层面

- [x] 任何镜像文件修改后先运行 `bun test ./packages/core/src/test/unit/openai-provider-mirror.test.ts`。
- [x] 合并前仍运行完整 `bun run test`，使镜像边界测试成为最终门禁。

### 5.3 流程/规范层面

- [ ] 代码审查清单增加“是否修改受 mirror test 覆盖的双实现文件”的检查项。

## 6. 经验总结（一句话）

严格类型修复在镜像实现中必须成对同步：类型检查验证单个文件，镜像边界测试验证两个包仍代表同一行为。
