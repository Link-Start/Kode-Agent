# Kode 架构设计 V2 - 多端统一架构

> 基于真实需求的深度重新设计

---

## 一、问题诊断：为什么之前的设计有问题

### 1.1 之前设计的混乱点

```
问题1: hosts/cli/ui/ 和 ui/ink/ 重复
  ├─ hosts/ 应该是"入口适配"，不应该包含 UI 组件
  └─ UI 组件应该统一在一个地方

问题2: daemon 和 web 关系不清
  ├─ daemon 是 HTTP/WS 服务器
  ├─ web 是前端 UI
  └─ 它们是 client-server 关系，不是并列关系

问题3: 概念混淆
  ├─ "Host" = 入口点？适配器？运行环境？
  ├─ "UI" = 组件库？应用？渲染层？
  └─ 边界模糊导致代码放置困难
```

### 1.2 真实需求分析

```
你需要支持的场景：

1. 终端 CLI
   - 直接运行在终端
   - 使用 Ink 渲染
   - 交互式 REPL

2. VS Code 插件
   - 作为 VSCode Extension 运行
   - 使用 VSCode 的 Webview
   - 调用 Core 逻辑

3. 本地客户端（Electron）
   - 独立桌面应用
   - 主进程 + 渲染进程
   - 可能包含后台服务

4. 本地 Web UI
   - 浏览器访问
   - 需要后端服务（daemon）
   - React 前端

5. 纯 API 模式（headless）
   - 作为库被其他程序调用
   - 无 UI
   - 如：CI/CD 集成
```

---

## 二、核心洞察：分离三个维度

```
┌─────────────────────────────────────────────────────────────────────┐
│                    三个正交的维度                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  维度1: 核心逻辑 (Core)                                             │
│  ├─ 查询引擎、工具系统、权限系统                                    │
│  ├─ 纯 TypeScript，无 IO，无 UI                                     │
│  └─ 所有平台共享                                                    │
│                                                                      │
│  维度2: 运行时适配 (Runtime)                                        │
│  ├─ 文件系统、Shell、网络                                           │
│  ├─ Node.js / Bun / Electron                                        │
│  └─ 运行环境相关                                                    │
│                                                                      │
│  维度3: 用户界面 (UI)                                               │
│  ├─ Ink (终端)、React (Web)、VSCode Webview                         │
│  ├─ 纯展示逻辑                                                      │
│  └─ 可独立复用                                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

这三个维度应该是正交的、独立变化的。
```

---

## 三、理想架构：清晰的分层

### 3.1 架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KODE ARCHITECTURE V2                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  APPLICATIONS (apps/)                                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                                                                  ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ ││
│  │  │   CLI    │  │  VSCode  │  │ Electron │  │   Web Server     │ ││
│  │  │   App    │  │Extension │  │   App    │  │   (API Only)     │ ││
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ ││
│  │       │             │             │                  │           ││
│  │       └─────────────┴─────────────┴──────────────────┘           ││
│  │                              │                                   ││
│  └──────────────────────────────│───────────────────────────────────┘│
│                                 │                                    │
│  PRESENTATION (ui/)             │                                    │
│  ┌──────────────────────────────│───────────────────────────────────┐│
│  │                              │                                   ││
│  │  ┌────────────┐  ┌───────────┴───────────┐  ┌──────────────────┐ ││
│  │  │  ui/ink    │  │      ui/react         │  │   ui/shared      │ ││
│  │  │            │  │                       │  │                  │ ││
│  │  │ Terminal   │  │  ┌─────────────────┐  │  │  共享逻辑:       │ ││
│  │  │ Components │  │  │   Web Client    │  │  │  - hooks         │ ││
│  │  │            │  │  │   (SPA)         │  │  │  - state         │ ││
│  │  │ - REPL     │  │  └─────────────────┘  │  │  - types         │ ││
│  │  │ - Input    │  │  ┌─────────────────┐  │  │  - utils         │ ││
│  │  │ - Message  │  │  │ VSCode Webview  │  │  │                  │ ││
│  │  │ - Dialog   │  │  │   (Panel)       │  │  │                  │ ││
│  │  │            │  │  └─────────────────┘  │  │                  │ ││
│  │  └────────────┘  └───────────────────────┘  └──────────────────┘ ││
│  │                                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                 │                                    │
│  CORE (packages/)               │                                    │
│  ┌──────────────────────────────│───────────────────────────────────┐│
│  │                              │                                   ││
│  │  ┌───────────────────────────┴────────────────────────────────┐  ││
│  │  │                     @kode/core                             │  ││
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  ││
│  │  │  │  Engine  │ │  Tools   │ │Permission│ │   Context    │  │  ││
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  ││
│  │  │                    纯逻辑，无 IO，无 UI                     │  ││
│  │  └────────────────────────────────────────────────────────────┘  ││
│  │                              │                                   ││
│  │  ┌───────────────────────────┴────────────────────────────────┐  ││
│  │  │                   @kode/services                           │  ││
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │  ││
│  │  │  │   LLM    │ │  Shell   │ │  Config  │ │    MCP       │  │  ││
│  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │  ││
│  │  │                依赖 Runtime 抽象                            │  ││
│  │  └────────────────────────────────────────────────────────────┘  ││
│  │                              │                                   ││
│  │  ┌───────────────────────────┴────────────────────────────────┐  ││
│  │  │                   @kode/tools                              │  ││
│  │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐         │  ││
│  │  │  │Bash │ │File │ │Grep │ │Task │ │Ask  │ │...  │         │  ││
│  │  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘         │  ││
│  │  └────────────────────────────────────────────────────────────┘  ││
│  │                              │                                   ││
│  └──────────────────────────────│───────────────────────────────────┘│
│                                 │                                    │
│  INFRASTRUCTURE (packages/)     │                                    │
│  ┌──────────────────────────────│───────────────────────────────────┐│
│  │                              │                                   ││
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  ││
│  │  │@kode/    │  │@kode/    │  │@kode/    │  │    @kode/        │  ││
│  │  │runtime   │  │protocol  │  │ logger   │  │    testing       │  ││
│  │  │          │  │          │  │          │  │                  │  ││
│  │  │ 抽象接口 │  │ 类型定义 │  │ 日志系统 │  │   测试工具       │  ││
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  ││
│  │                                                                  ││
│  │  ┌──────────────────────────────────────────────────────────────┐││
│  │  │             Runtime Implementations                          │││
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │││
│  │  │  │  runtime/  │  │  runtime/  │  │      runtime/          │ │││
│  │  │  │   node     │  │   bun      │  │      electron          │ │││
│  │  │  └────────────┘  └────────────┘  └────────────────────────┘ │││
│  │  └──────────────────────────────────────────────────────────────┘││
│  │                                                                  ││
│  └──────────────────────────────────────────────────────────────────┘│
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 目录结构

```
kode/
│
├── apps/                          # 应用入口（最终产品）
│   │
│   ├── cli/                       # 终端应用
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts           # 入口
│   │   │   ├── app.tsx            # 主应用（组合 ui/ink 组件）
│   │   │   ├── commands/          # CLI 特有命令（config, doctor）
│   │   │   └── bootstrap.ts       # 初始化逻辑
│   │   └── bin/
│   │       └── kode.js            # npm bin 入口
│   │
│   ├── vscode/                    # VSCode 扩展
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── extension.ts       # VSCode 入口
│   │   │   ├── webview/           # Webview 面板管理
│   │   │   └── commands/          # VSCode 命令
│   │   └── webview-ui/            # 引用 ui/react/vscode
│   │
│   ├── electron/                  # 桌面客户端（未来）
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main/              # Electron 主进程
│   │   │   │   ├── index.ts
│   │   │   │   └── daemon.ts      # 内嵌后台服务
│   │   │   └── preload/
│   │   └── renderer/              # 引用 ui/react/desktop
│   │
│   └── server/                    # API 服务器（daemon）
│       ├── package.json
│       ├── src/
│       │   ├── index.ts           # 入口
│       │   ├── server.ts          # HTTP/WS 服务器（<200行）
│       │   ├── routes/            # API 路由
│       │   │   ├── chat.ts        # /api/chat
│       │   │   ├── session.ts     # /api/sessions
│       │   │   └── tools.ts       # /api/tools
│       │   ├── handlers/          # 请求处理器
│       │   │   ├── chat.handler.ts
│       │   │   ├── git.handler.ts
│       │   │   └── shell.handler.ts
│       │   └── ws/                # WebSocket 处理
│       │       ├── connection.ts
│       │       └── events.ts
│       └── __tests__/
│
├── ui/                            # UI 层（纯展示）
│   │
│   ├── ink/                       # 终端 UI 组件库
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts           # 导出所有组件
│   │   │   ├── components/        # 原子组件
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Select.tsx
│   │   │   │   ├── Spinner.tsx
│   │   │   │   └── Message.tsx
│   │   │   ├── composites/        # 复合组件
│   │   │   │   ├── PromptInput.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── PermissionDialog.tsx
│   │   │   │   └── ToolOutput.tsx
│   │   │   └── screens/           # 页面级组件
│   │   │       ├── REPL.tsx       # 主 REPL 界面
│   │   │       ├── Settings.tsx
│   │   │       └── History.tsx
│   │   └── __tests__/
│   │
│   ├── react/                     # React UI 组件库
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── components/        # 共享组件
│   │   │   │   ├── Chat.tsx
│   │   │   │   ├── MessageBubble.tsx
│   │   │   │   ├── ToolResult.tsx
│   │   │   │   └── PermissionModal.tsx
│   │   │   ├── web/               # Web 特有组件
│   │   │   │   ├── App.tsx
│   │   │   │   ├── pages/
│   │   │   │   └── layouts/
│   │   │   ├── vscode/            # VSCode Webview 特有
│   │   │   │   ├── Panel.tsx
│   │   │   │   └── vscode-api.ts
│   │   │   └── desktop/           # Electron 渲染器特有
│   │   │       ├── App.tsx
│   │   │       └── window-controls.tsx
│   │   └── __tests__/
│   │
│   └── shared/                    # UI 共享逻辑（非组件）
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── hooks/             # 共享 hooks
│       │   │   ├── useChat.ts     # 聊天状态管理
│       │   │   ├── usePermission.ts
│       │   │   └── useTools.ts
│       │   ├── store/             # 状态管理
│       │   │   ├── chat.store.ts
│       │   │   └── session.store.ts
│       │   └── utils/             # UI 工具函数
│       │       ├── markdown.ts
│       │       └── formatting.ts
│       └── __tests__/
│
├── packages/                      # 核心包（平台无关）
│   │
│   ├── core/                      # 核心引擎
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts           # 公共 API
│   │   │   ├── engine/            # 查询引擎
│   │   │   │   ├── index.ts
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── message-pipeline.ts
│   │   │   │   └── query-executor.ts
│   │   │   ├── tools/             # 工具系统
│   │   │   │   ├── index.ts
│   │   │   │   ├── registry.ts
│   │   │   │   ├── middleware.ts
│   │   │   │   └── types.ts
│   │   │   ├── permissions/       # 权限系统
│   │   │   │   ├── index.ts
│   │   │   │   ├── engine.ts
│   │   │   │   └── policies/
│   │   │   └── context/           # 上下文构建
│   │   │       ├── index.ts
│   │   │       └── builder.ts
│   │   └── __tests__/
│   │
│   ├── services/                  # 服务层
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── llm/               # LLM 服务
│   │   │   │   ├── index.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── openai.ts
│   │   │   │   └── types.ts
│   │   │   ├── shell/             # Shell 服务
│   │   │   │   ├── index.ts
│   │   │   │   ├── executor.ts
│   │   │   │   └── sandbox.ts
│   │   │   ├── config/            # 配置服务
│   │   │   │   ├── index.ts
│   │   │   │   ├── loader.ts
│   │   │   │   └── schemas.ts
│   │   │   └── mcp/               # MCP 服务
│   │   │       ├── index.ts
│   │   │       └── client.ts
│   │   └── __tests__/
│   │
│   ├── tools/                     # 内置工具
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── bash/
│   │   │   ├── filesystem/
│   │   │   ├── search/
│   │   │   └── ai/
│   │   └── __tests__/
│   │
│   ├── protocol/                  # 协议定义
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── messages.ts
│   │   │   ├── events.ts
│   │   │   └── schemas.ts
│   │   └── __tests__/
│   │
│   ├── runtime/                   # 运行时抽象
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts           # 接口定义
│   │   │   ├── types.ts
│   │   │   ├── node/              # Node.js 实现
│   │   │   │   └── index.ts
│   │   │   ├── bun/               # Bun 实现
│   │   │   │   └── index.ts
│   │   │   └── electron/          # Electron 实现
│   │   │       └── index.ts
│   │   └── __tests__/
│   │
│   ├── logger/                    # 日志系统
│   │   └── ...
│   │
│   └── client/                    # API 客户端（给 UI 用）
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── http.ts            # HTTP 客户端
│       │   ├── websocket.ts       # WebSocket 客户端
│       │   └── types.ts
│       └── __tests__/
│
├── docs/
├── examples/
├── scripts/
└── ...
```

---

## 四、关键设计决策

### 4.1 apps/ vs packages/ vs ui/ 的区别

```yaml
apps/:
  定义: 最终可运行的产品
  特点:
    - 有自己的入口点（bin, extension.ts, main/index.ts）
    - 组合其他包来实现功能
    - 平台特定的启动和配置逻辑
  例子:
    - apps/cli: 终端应用，组合 @kode/core + ui/ink
    - apps/vscode: VSCode 扩展，组合 @kode/core + ui/react/vscode
    - apps/server: API 服务器，只有 @kode/core，无 UI

packages/:
  定义: 可复用的核心逻辑包
  特点:
    - 纯逻辑，无入口点
    - 平台无关（或通过 runtime 抽象）
    - 被 apps/ 和 ui/ 依赖
  例子:
    - @kode/core: 引擎、工具、权限
    - @kode/services: LLM、Shell、Config
    - @kode/protocol: 类型定义、消息格式

ui/:
  定义: UI 组件库和共享 UI 逻辑
  特点:
    - 纯展示逻辑
    - 依赖 @kode/client（而非直接依赖 @kode/core）
    - 可被不同 apps/ 复用
  例子:
    - ui/ink: 终端组件
    - ui/react: Web/VSCode/Electron 组件
    - ui/shared: 共享 hooks 和 state
```

### 4.2 为什么 daemon 在 apps/ 而不是 packages/

```
之前的问题：daemon 放在 packages/ 或 hosts/

正确理解：
- daemon 是一个"服务器应用"
- 它有自己的入口点、配置、部署逻辑
- 它是"最终产品"，不是"可复用的库"

apps/server/ 的职责：
1. 启动 HTTP/WS 服务器
2. 定义 API 路由
3. 处理认证/授权
4. 调用 @kode/core 执行业务逻辑
5. 不包含 UI

Web UI (ui/react/web) 的职责：
1. 提供浏览器界面
2. 通过 @kode/client 与 apps/server 通信
3. 纯前端，可独立部署

关系：
  Web UI (ui/react/web)
         │
         │ HTTP/WS
         ▼
  Server (apps/server)
         │
         │ 函数调用
         ▼
  Core (@kode/core)
```

### 4.3 ui/react 内部的子目录（web/, vscode/, desktop/）

```
为什么不是独立的包？

因为它们共享大量组件，区别只是：
- 入口组件（App.tsx）
- 平台特定的 API 调用
- 样式/主题微调

ui/react/
├── src/
│   ├── components/     # 共享组件（80%）
│   │   ├── Chat.tsx
│   │   └── ...
│   ├── web/            # Web 特有（10%）
│   │   ├── App.tsx     # Web 入口
│   │   └── pages/
│   ├── vscode/         # VSCode 特有（10%）
│   │   ├── Panel.tsx   # VSCode 入口
│   │   └── vscode-api.ts
│   └── desktop/        # Electron 特有（10%）
│       └── App.tsx

这样：
- 共享组件只写一次
- 各平台入口分别维护
- 构建时可以 tree-shake 不需要的部分
```

### 4.4 @kode/client 的角色

```
问题：UI 应该如何与 Core 通信？

方案1: UI 直接导入 @kode/core（之前的设计）
  问题：
  - UI 和 Core 强耦合
  - Web UI 无法与远程 Server 通信
  - VSCode 扩展需要不同的通信方式

方案2: UI 通过 @kode/client 通信
  @kode/client 提供统一接口：

  interface KodeClient {
    // 消息交互
    sendMessage(msg: string): AsyncGenerator<Event>
    cancelRequest(): void

    // 会话管理
    listSessions(): Promise<Session[]>
    loadSession(id: string): Promise<Session>

    // 工具交互
    approveToolUse(id: string): Promise<void>
    denyToolUse(id: string): Promise<void>
  }

  实现可以是：
  - DirectClient: 直接调用 @kode/core（CLI 模式）
  - HttpClient: 通过 HTTP/WS 调用 apps/server
  - VSCodeClient: 通过 VSCode message API

  UI 不关心底层实现，只用统一接口。
```

---

## 五、依赖关系图

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DEPENDENCY GRAPH                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  apps/cli ──────────────────────────────────────┐                   │
│      │                                          │                   │
│      ├─→ ui/ink ───────────────────────────┐    │                   │
│      │       │                             │    │                   │
│      │       └─→ ui/shared ────────────────┼────┤                   │
│      │                │                    │    │                   │
│      │                └─→ @kode/client ────┼────┤                   │
│      │                         │           │    │                   │
│      └─→ @kode/core ←──────────┘           │    │                   │
│              │                             │    │                   │
│              ├─→ @kode/services            │    │                   │
│              │        │                    │    │                   │
│              │        └─→ @kode/runtime    │    │                   │
│              │                             │    │                   │
│              ├─→ @kode/tools               │    │                   │
│              │                             │    │                   │
│              └─→ @kode/protocol ←──────────┴────┤                   │
│                                                 │                   │
│  apps/server ───────────────────────────────────┤                   │
│      │                                          │                   │
│      └─→ @kode/core                             │                   │
│              │                                  │                   │
│              └─→ ... (同上)                     │                   │
│                                                 │                   │
│  apps/vscode ───────────────────────────────────┤                   │
│      │                                          │                   │
│      ├─→ ui/react/vscode ───────────────────────┤                   │
│      │       │                                  │                   │
│      │       └─→ ui/shared ─→ @kode/client      │                   │
│      │                                          │                   │
│      └─→ @kode/core                             │                   │
│                                                 │                   │
│  ui/react/web ──────────────────────────────────┘                   │
│      │                                                              │
│      └─→ ui/shared ─→ @kode/client ─→ (HTTP) ─→ apps/server         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

关键原则：
1. apps/ 依赖 packages/ 和 ui/
2. ui/ 只依赖 @kode/client 和 @kode/protocol，不依赖 @kode/core
3. packages/ 之间有严格的依赖方向
4. 无循环依赖
```

---

## 六、各场景的代码流

### 6.1 CLI 场景

```
用户输入
    │
    ▼
apps/cli/src/app.tsx
    │
    ├─→ ui/ink/REPL.tsx (展示)
    │         │
    │         └─→ ui/shared/useChat.ts (状态)
    │                   │
    │                   └─→ @kode/client/DirectClient
    │                             │
    └─→ @kode/core/engine ←───────┘ (直接调用)
              │
              └─→ @kode/services/llm
```

### 6.2 Web UI 场景

```
用户输入
    │
    ▼
ui/react/web/App.tsx (浏览器)
    │
    └─→ ui/shared/useChat.ts
              │
              └─→ @kode/client/HttpClient
                        │
                        │ HTTP/WebSocket
                        ▼
              apps/server/routes/chat.ts
                        │
                        └─→ @kode/core/engine
                                  │
                                  └─→ @kode/services/llm
```

### 6.3 VSCode 扩展场景

```
用户输入
    │
    ▼
apps/vscode/src/extension.ts
    │
    ├─→ 创建 Webview Panel
    │         │
    │         └─→ ui/react/vscode/Panel.tsx
    │                   │
    │                   └─→ ui/shared/useChat.ts
    │                             │
    │                             └─→ @kode/client/VSCodeClient
    │                                       │
    │                                       │ postMessage
    │                                       ▼
    └─→ 消息处理 ─→ @kode/core/engine
                            │
                            └─→ @kode/services/llm
```

### 6.4 Electron 场景（未来）

```
用户输入
    │
    ▼
apps/electron/renderer/index.tsx
    │
    └─→ ui/react/desktop/App.tsx
              │
              └─→ ui/shared/useChat.ts
                        │
                        └─→ @kode/client/IPCClient
                                  │
                                  │ Electron IPC
                                  ▼
              apps/electron/main/daemon.ts
                        │
                        └─→ @kode/core/engine
```

---

## 七、与当前代码的映射

### 7.1 迁移映射表

```yaml
当前结构:                          目标结构:
─────────────────────────────────────────────────────────────
packages/host-cli/              →  apps/cli/
packages/host-acp/              →  删除（合并到 apps/server）
packages/host-mcp/              →  删除（作为 @kode/core 的功能）
packages/daemon/                →  apps/server/
packages/core/                  →  packages/core/ + packages/services/
packages/tools-builtin/         →  packages/tools/
packages/config/                →  packages/services/config/
packages/protocol/              →  packages/protocol/
packages/runtime/               →  packages/runtime/
packages/runtime-node/          →  packages/runtime/node/
packages/runtime-bun/           →  packages/runtime/bun/
ui/ink/                         →  ui/ink/
ui/web/                         →  ui/react/web/
(新增)                          →  ui/react/vscode/
(新增)                          →  ui/shared/
(新增)                          →  packages/client/
(新增)                          →  apps/vscode/
(新增)                          →  apps/electron/
```

### 7.2 需要拆分的大文件

```yaml
当前文件:                         目标拆分:
─────────────────────────────────────────────────────────────
query/index.ts (1315行)       →  engine/orchestrator.ts (~250行)
                                 engine/message-pipeline.ts (~200行)
                                 engine/query-executor.ts (~200行)

daemon/server.ts (1764行)     →  apps/server/server.ts (~150行)
                                 apps/server/routes/*.ts
                                 apps/server/handlers/*.ts
                                 apps/server/ws/*.ts

bashToolPermissionEngine      →  permissions/engine.ts (~400行)
(2617行)                         permissions/policies/bash/parser.ts (~300行)
                                 permissions/policies/bash/validator.ts (~200行)

BunShell.ts (1845行)          →  services/shell/executor.ts (~400行)
                                 services/shell/sandbox.ts (~300行)
                                 services/shell/background.ts (~200行)

ModelSelector.tsx (2038行)    →  ui/ink/screens/ModelSelector.tsx (~400行)
                                 ui/ink/screens/ModelSelector/*.tsx (子组件)
                                 ui/shared/hooks/useModelSelection.ts
```

---

## 八、关键优势

### 8.1 对比之前的设计

| 方面 | 之前的设计 | 新设计 | 改进 |
|------|-----------|--------|------|
| UI 位置 | hosts/cli/ui + ui/ink 重复 | ui/ 统一管理 | 清晰 |
| daemon/web 关系 | 并列不清 | client-server 明确 | 合理 |
| VSCode 集成 | 未考虑 | apps/vscode + ui/react/vscode | 支持 |
| Electron | 未考虑 | apps/electron + ui/react/desktop | 支持 |
| UI-Core 通信 | 直接依赖 | 通过 @kode/client | 解耦 |

### 8.2 扩展性验证

```yaml
场景: 添加 JetBrains IDE 插件支持

步骤:
  1. 创建 apps/jetbrains/
  2. 使用 ui/react/components（共享）
  3. 创建 ui/react/jetbrains/（特有入口）
  4. 实现 @kode/client/JBClient

影响范围:
  - @kode/core: 不变
  - ui/ink: 不变
  - ui/react/web: 不变
  - apps/cli: 不变
  - apps/server: 不变

这证明架构是可扩展的。
```

### 8.3 可维护性验证

```yaml
场景: 更换 LLM 提供商

步骤:
  1. 在 packages/services/llm/ 添加新适配器
  2. 更新 @kode/core 的配置

影响范围:
  - ui/*: 不变
  - apps/*: 不变
  - packages/tools: 不变

这证明关注点分离是有效的。
```

---

## 九、迁移路径

### Phase 1: 基础重组（Week 1）

```yaml
Day 1-2: 创建新目录结构
  - [ ] 创建 apps/, ui/, packages/ 目录
  - [ ] 移动 packages/daemon → apps/server
  - [ ] 移动 packages/host-cli → apps/cli

Day 3-4: 统一 UI 层
  - [ ] 保持 ui/ink 不变
  - [ ] 移动 ui/web → ui/react/web
  - [ ] 创建 ui/shared

Day 5: 创建 @kode/client
  - [ ] 定义 KodeClient 接口
  - [ ] 实现 DirectClient（CLI 用）
  - [ ] 实现 HttpClient（Web 用）
```

### Phase 2: Core 重构（Week 2-3）

```yaml
Week 2: 拆分核心模块
  - [ ] 拆分 query/index.ts
  - [ ] 分离 services 包
  - [ ] 整合 runtime 实现

Week 3: 拆分大文件
  - [ ] 拆分 daemon/server.ts
  - [ ] 拆分 bashToolPermissionEngine
  - [ ] 拆分 BunShell.ts
```

### Phase 3: UI 优化（Week 4）

```yaml
- [ ] 重构 ui/ink 组件
- [ ] 创建 ui/shared/hooks
- [ ] 准备 VSCode 扩展框架
```

---

## 十、总结

这个架构的核心思想：

1. **apps/ 是产品**：CLI、Server、VSCode、Electron 都是独立产品
2. **packages/ 是能力**：Core、Services、Tools 提供核心能力
3. **ui/ 是界面**：Ink、React 提供展示能力
4. **@kode/client 是桥梁**：统一 UI 与 Core 的通信方式

这样设计的好处：

- **清晰的边界**：每个目录的职责明确
- **真正的复用**：ui/react/components 可以在 Web/VSCode/Electron 复用
- **灵活的部署**：CLI 可以单独用，Server+WebUI 可以分开部署
- **易于扩展**：添加新平台只需要新的 apps/ 和少量 ui/ 代码
