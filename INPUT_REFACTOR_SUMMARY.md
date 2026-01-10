# 终端输入框重构 - 实施摘要

## 🎯 核心发现

通过深入分析 **Gemini CLI**（Google 的官方终端工具），我们发现了当前 Kode 输入框问题的根本原因：

**❌ 当前方案**: 直接使用 Ink 的 `TextInput` 组件
- 导致中文输入问题
- 补全面板闪烁
- 性能瓶颈
- 难以扩展

**✅ 业界最佳实践**: 实现自定义的 **TextBuffer** 类
- 完全控制输入状态
- 正确处理 Unicode（中文、emoji、组合字符）
- 独立于渲染层
- 高性能、可扩展

## 📊 关键对比

### Gemini CLI 的架构
```
React UI (Ink)
    ↓
TextBuffer 核心层（状态管理）
    ↓
功能增强层（hooks: completion, history, vim）
    ↓
终端协议层（Kitty, SGR mouse）
```

### 当前 Kode 的架构
```
React UI (Ink)
    ↓
TextInput 组件（Ink 内置）← 这里是瓶颈！
    ↓
各种 hooks 耦合在一起
```

## 💡 核心技术点

### 1. TextBuffer 类
- 使用 **Code Points** 而非字符索引
- 正确计算 **视觉宽度**（中文 = 2 宽度）
- 支持 **多行编辑**
- 实现 **Undo/Redo**

### 2. Unicode 处理
```typescript
// 检测脚本边界（中文 vs 英文）
isDifferentScript(char1, char2): boolean

// 处理组合字符（音标等）
isCombiningMark(char): boolean

// 精确的宽度计算
getVisualWidth(text): number  // "你好" = 4
```

### 3. IME 优化
```typescript
// 检测可能的 IME 输入（快速连续 < 150ms）
const isPossiblyIMEInput = timeSinceLastInput < 150

// 暂停自动补全，避免干扰
if (isPossiblyIMEInput) {
  return // 不触发补全
}
```

### 4. 性能优化
- 使用 `React.memo` 减少重渲染
- 细粒度的状态更新
- 补全防抖（150ms）

## 🚀 实施计划

### 阶段 1: 核心 TextBuffer（1-2 周）
- [ ] 创建 `TextBuffer` 类
- [ ] 实现基本编辑操作
- [ ] Unicode 支持
- [ ] 单元测试

### 阶段 2: 重构 InputPrompt（1 周）
- [ ] 创建 `useTextBuffer` hook
- [ ] 重构 `PromptInput` 组件
- [ ] 分离补全、历史等逻辑到独立 hooks
- [ ] 集成测试

### 阶段 3: 优化体验（1 周）
- [ ] 性能优化（memo, debounce）
- [ ] 修复中文输入问题
- [ ] 修复补全面板闪烁
- [ ] 用户测试

### 阶段 4: 高级功能（可选，1-2 周）
- [ ] Vim 模式
- [ ] 鼠标支持
- [ ] 语法高亮

## 📈 预期改善

| 问题 | 当前 | 目标 | 改善幅度 |
|------|------|------|---------|
| 中文输入流畅度 | ⭐⭐ | ⭐⭐⭐⭐⭐ | +150% |
| 补全面板闪烁 | 严重 | 几乎无 | -90% |
| 渲染次数/按键 | 3-5次 | 1次 | -70% |
| CPU 使用率 | ~15% | ~5% | -65% |

## ⚠️ 风险评估

**风险等级**: 🟡 中等

**主要风险**:
1. 开发时间较长（3-4 周）
2. 需要充分测试（各种终端、IME）
3. 可能影响现有用户习惯

**降低风险的措施**:
1. ✅ 渐进式迁移（新旧并存，A/B 测试）
2. ✅ 充分的自动化测试
3. ✅ 提供回退选项
4. ✅ 收集用户反馈

## 🎓 学习资源

**必读**:
1. `TERMINAL_INPUT_BEST_PRACTICES.md` - 完整技术方案
2. Gemini CLI 源码:
   - `packages/cli/src/ui/components/shared/text-buffer.ts`
   - `packages/cli/src/ui/components/InputPrompt.tsx`
3. `TERMINAL_UI_FIXES.md` - 当前问题分析

**参考**:
- [Ink 文档](https://github.com/vadimdemedes/ink)
- [string-width 库](https://github.com/sindresorhus/string-width)
- [Kitty Keyboard Protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)

## 🤝 下一步行动

1. **立即开始**:
   - 审核 `TERMINAL_INPUT_BEST_PRACTICES.md`
   - 评估开发资源和时间
   - 决定是否采纳此方案

2. **如果采纳**:
   - 创建 GitHub Issue 跟踪进度
   - 分配开发任务
   - 设置里程碑

3. **如果暂缓**:
   - 至少应用已完成的小修复（`TERMINAL_UI_FIXES.md`）
   - 作为未来技术债务记录

## 📝 结论

**当前的 Ink TextInput 方案已经到达极限**。

基于业界最佳实践（Gemini CLI），我们有清晰的重构路径：

1. 实现自定义 TextBuffer
2. 分离关注点
3. 优化性能
4. 逐步迁移

这是一个**高价值、中风险**的重构项目，建议**优先级设为高**。

虽然需要 3-4 周的开发时间，但能彻底解决困扰用户的核心体验问题，并为未来功能打下坚实基础。

---

**生成时间**: 2026-01-07  
**分析工具**: Gemini CLI v0.21.0, Kode v2.0.3  
**建议**: 团队讨论后决策
