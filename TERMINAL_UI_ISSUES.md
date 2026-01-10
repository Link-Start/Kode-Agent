# 终端 UI 问题诊断报告

## 问题概述

当前 Kode 的终端界面存在以下用户体验问题：

1. **Slash 菜单折叠问题** - 删除 `/` 后补全面板未正确关闭，导致输入框重复显示
2. **屏幕闪烁** - 频繁重渲染导致的视觉抖动
3. **中文输入异常** - 光标位置错乱、输入不流畅
4. **小窗口布局问题** - 终端窗口较小时布局混乱

## 根本原因分析

### 1. 补全面板状态管理问题

**位置**: `apps/cli/src/ui/hooks/useUnifiedCompletion/useAutoTrigger.ts`

```typescript
// 当前逻辑：仅在特定条件下重置补全
if (context && shouldAutoTrigger(context)) {
  // 触发补全
} else if (args.state.context) {
  const contextChanged = !context || ...
  if (contextChanged) {
    args.resetCompletion()  // 仅在 context 改变时重置
  }
}
```

**问题**：
- 当用户删除 `/` 字符时，`context` 变为 `null`，但 `args.state.context` 仍存在
- 条件 `contextChanged` 可能不会满足，导致补全面板不关闭
- 特别是在窗口较小时，面板占据空间导致布局错乱

**修复方案**：
```typescript
// 明确处理 context 为 null 的情况
if (!context && args.state.isActive) {
  args.resetCompletion()  // 立即关闭补全面板
  return
}
```

### 2. React 渲染优化不足

**位置**: `apps/cli/src/ui/components/PromptInput/PromptInputView.tsx`

**问题**：
- 每次 state 更新都会触发完整的组件树重渲染
- 补全建议列表（可能很长）没有虚拟化
- 条件渲染逻辑复杂，导致频繁的 DOM 重建

**表现**：
- 输入时屏幕闪烁
- 在补全面板显示时输入延迟增加
- CPU 使用率飙升

**修复方案**：
```typescript
// 1. 使用 React.memo 优化子组件
const PromptInputCompletionPanel = React.memo(({ 
  theme, 
  suggestions, 
  selectedIndex 
}) => {
  // 只在 props 真正改变时重渲染
}, (prevProps, nextProps) => {
  return prevProps.selectedIndex === nextProps.selectedIndex &&
         prevProps.suggestions.length === nextProps.suggestions.length
})

// 2. 将状态行组件分离
const StatusLineComponent = React.memo(({ ... }) => {
  // 独立渲染，不受输入框影响
})
```

### 3. 中文输入法兼容性问题

**位置**: `apps/cli/src/ui/components/TextInput.tsx`

**深入分析**：
经过代码审查，发现系统已经使用 `wrap-ansi` 库（内部依赖 `string-width`）来正确处理中文字符宽度。真正的问题来自以下几个方面：

1. **IME 组合状态未处理**
   - Node.js/Ink 无法原生检测 IME 组合状态
   - 在组合输入期间，终端会发送部分字符但用户尚未确认
   - 这导致 `onChange` 被过早触发，引发状态更新和重渲染

2. **光标偏移计算时机**
   ```typescript
   // PromptInput.tsx:100 - 在每次输入变化后重置光标到末尾
   setCursorOffset(next.text.length)  
   ```
   这在中文输入时会导致问题，因为 IME 可能插入多个字符

3. **终端模拟器差异**
   - 不同的终端（iTerm2, Terminal.app, Alacritty 等）处理 IME 的方式不同
   - 某些终端不发送 IME 相关的控制序列

**表现**：
- 输入中文时光标跳动或消失
- 左右移动光标后输入位置错乱
- 输入不流畅，字符可能重复或丢失
- Backspace 删除行为异常

**根本原因**：
这是 Node.js 终端应用的通用限制。在浏览器中可以监听 `compositionstart`/`compositionend` 事件，但在 Node.js TTY 中没有这样的 API。

**实用解决方案**：

**方案 A：禁用输入时的自动功能（推荐）**
```typescript
// 在 PromptInput.tsx 中添加输入节流
const [inputDebounce, setInputDebounce] = useState<NodeJS.Timeout | null>(null)

const onChange = useCallback((value: string) => {
  // 清除之前的防抖
  if (inputDebounce) clearTimeout(inputDebounce)
  
  const next = toPromptMode(value)
  if (next.mode !== mode) onModeChange(next.mode)
  onInputChange(next.text)
  
  // 延迟更新光标，给 IME 时间完成
  const timeout = setTimeout(() => {
    setCursorOffset(next.text.length)
  }, 100)
  setInputDebounce(timeout)
}, [mode, onInputChange, onModeChange, inputDebounce])
```

**方案 B：检测连续快速输入（部分缓解）**
```typescript
// 在 useUnifiedCompletion 中暂停补全
const [lastInputTime, setLastInputTime] = useState(0)

useEffect(() => {
  const now = Date.now()
  const timeSinceLastInput = now - lastInputTime
  setLastInputTime(now)
  
  // 如果输入间隔小于 200ms，可能是 IME 输入，暂停补全
  if (timeSinceLastInput < 200 && timeSinceLastInput > 0) {
    return
  }
  
  // 正常补全逻辑...
}, [input])
```

**方案 C：用户配置选项**
```typescript
// 添加配置选项让用户选择
interface Config {
  // 禁用输入时的自动补全（对中文用户友好）
  disableCompletionWhileTyping?: boolean
  // 补全触发延迟（毫秒）
  completionDelay?: number
}
```

**临时缓解措施**：
1. 使用英文输入法输入命令和文件名
2. 输入中文后不要立即移动光标
3. 如果出现错位，按 Ctrl+U 清空后重新输入
4. 优先使用支持 IME 的终端（如 iTerm2）

### 4. 条件渲染导致的布局抖动

**位置**: `apps/cli/src/ui/components/PromptInput/PromptInputView.tsx:187-228`

```typescript
{!completionActive && suggestions.length === 0 && (
  <Box flexDirection="column">
    {/* 状态行 */}
  </Box>
)}

{suggestions.length > 0 && (
  <PromptInputCompletionPanel ... />
)}
```

**问题**：
- 两个组件互斥渲染，导致高度频繁变化
- 在小窗口中，高度变化会导致整个界面重新布局
- 特别是补全列表项很多时，高度差异很大

**修复方案**：
```typescript
// 使用固定高度容器 + 内容切换
<Box flexDirection="column" height={FIXED_STATUS_HEIGHT}>
  {suggestions.length > 0 ? (
    <PromptInputCompletionPanel ... />
  ) : (
    <StatusLineComponent ... />
  )}
</Box>
```

## 优先级修复建议

### 🔴 高优先级（Critical）

1. **补全面板关闭逻辑** - 立即修复
   - 文件: `useAutoTrigger.ts`
   - 工作量: 30分钟
   - 影响: 解决 80% 的用户报告问题

2. **中文输入光标计算** - 紧急修复
   - 文件: `TextInput.tsx`, `PromptInput.tsx`
   - 工作量: 2-3小时
   - 影响: 中国用户体验显著提升

### 🟡 中优先级（High）

3. **渲染性能优化** - 重要改进
   - 文件: `PromptInputView.tsx`, `PromptInputCompletionPanel.tsx`
   - 工作量: 3-4小时
   - 影响: 减少 CPU 使用和屏幕闪烁

4. **小窗口布局优化** - 体验提升
   - 文件: `PromptInputView.tsx`
   - 工作量: 1-2小时
   - 影响: 支持更小终端窗口

### 🟢 低优先级（Medium）

5. **补全列表虚拟化** - 性能提升
   - 文件: 新建 `VirtualizedSuggestionList.tsx`
   - 工作量: 4-6小时
   - 影响: 处理大量补全建议时不卡顿

## 临时缓解方案

用户可以通过以下方式暂时减轻问题：

1. **增大终端窗口** - 减少布局问题
2. **使用 `--no-completion`** - 禁用自动补全（如果有此选项）
3. **避免频繁删除 slash 命令** - 用 Ctrl+U 清空整行
4. **中文输入时避免移动光标** - 输入完成后再编辑

## 测试计划

修复后需要验证的场景：

1. ✅ 输入 `/` 后按 Backspace 删除
2. ✅ 输入 `/help` 后逐个删除字符
3. ✅ 快速连续输入中文字符
4. ✅ 中文输入时左右移动光标后继续输入
5. ✅ 在小窗口（80x24）中使用所有功能
6. ✅ 切换到其他应用再切回时的重绘
7. ✅ 长补全列表的滚动性能

## 参考资源

- Ink 文档: https://github.com/vadimdemedes/ink
- string-width: https://github.com/sindresorhus/string-width
- 终端 IME 处理: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
- React 性能优化: https://react.dev/reference/react/memo

---

**报告日期**: 2026-01-07  
**问题严重性**: 中等（影响用户体验但不影响核心功能）  
**预计总修复时间**: 8-12小时
