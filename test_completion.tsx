#!/usr/bin/env bun
/**
 * 测试统一补全系统
 */
import { useUnifiedCompletion } from './src/hooks/useUnifiedCompletion'
import React from 'react'
import { render, Box, Text } from 'ink'
import { KeypressProvider } from './src/contexts/KeypressContext'

function TestCompletionCore() {
  const [input, setInput] = React.useState('/')
  const [cursorOffset, setCursorOffset] = React.useState(1)

  // 模拟命令数据
  const mockCommands = [
    { userFacingName: () => '/help', description: '显示帮助' },
    { userFacingName: () => '/model', description: '切换模型' },
    { userFacingName: () => '/clear', description: '清除历史' },
    { userFacingName: () => '/config', description: '打开配置' },
  ]

  // 测试补全钩子
  const {
    suggestions,
    selectedIndex,
    isActive,
    emptyDirMessage
  } = useUnifiedCompletion({
    input,
    cursorOffset,
    onInputChange: setInput,
    setCursorOffset,
    commands: mockCommands as any,
    onSubmit: () => {}
  })

  // 模拟输入变化
  React.useEffect(() => {
    const tests = [
      { input: '/', expected: 4 },  // 应该显示所有命令
      { input: '/h', expected: 1 }, // 应该只显示 /help
      { input: '/m', expected: 1 }, // 应该只显示 /model
      { input: '/c', expected: 2 }, // 应该显示 /clear 和 /config
      { input: '/xyz', expected: 0 }, // 没有匹配
    ]

    let currentTest = 0
    const timer = setInterval(() => {
      if (currentTest < tests.length) {
        const test = tests[currentTest]
        setInput(test.input)
        setCursorOffset(test.input.length)
        currentTest++
      } else {
        clearInterval(timer)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">
        🧪 测试统一补全系统
      </Text>
      <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>

      <Box marginTop={1}>
        <Text>输入: </Text>
        <Text color="cyan">{input}</Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="green">建议 ({suggestions.length}):</Text>
        {suggestions.map((suggestion, index) => (
          <Box key={index} marginLeft={2}>
            <Text color={index === selectedIndex ? 'cyan' : undefined}>
              {index === selectedIndex ? '▶ ' : '  '}
              {suggestion.displayValue}
            </Text>
          </Box>
        ))}
        {suggestions.length === 0 && (
          <Text marginLeft={2} dimColor>无匹配</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          激活: {isActive ? '✅' : '❌'} |
          选中: {selectedIndex} |
          空目录: {emptyDirMessage || '无'}
        </Text>
      </Box>
    </Box>
  )
}

// 包装组件
function TestCompletionApp() {
  return (
    <KeypressProvider>
      <TestCompletionCore />
    </KeypressProvider>
  )
}

// 运行测试
const app = render(<TestCompletionApp />)

// 6秒后退出
setTimeout(() => {
  app.unmount()
  console.log('\n补全系统测试完成')
  process.exit(0)
}, 6000)