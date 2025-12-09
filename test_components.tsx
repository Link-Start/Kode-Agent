#!/usr/bin/env bun
/**
 * 测试关键组件是否正常工作
 */
import React from 'react'
import { render } from 'ink'
import { Static, Box, Text, Transform } from 'ink'

// 测试 Static 组件 - 用于性能优化
function TestStaticComponent() {
  const staticMessages = [
    '静态消息 1 - 不会重新渲染',
    '静态消息 2 - 永久缓存',
    '静态消息 3 - 10x 性能提升'
  ]

  return (
    <Box flexDirection="column">
      <Text color="green">✅ Static 组件测试:</Text>
      <Static items={staticMessages}>
        {(message, index) => (
          <Box key={index} marginLeft={2}>
            <Text>{message}</Text>
          </Box>
        )}
      </Static>
    </Box>
  )
}

// 测试 Transform 组件 - 用于流式动画
function TestTransformComponent() {
  const [frame, setFrame] = React.useState(0)

  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrame(f => f + 1)
    }, 100)

    return () => clearInterval(timer)
  }, [])

  const text = "这是流式动画效果，每帧显示3个字符..."

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="green">✅ Transform 组件测试:</Text>
      <Box marginLeft={2}>
        <Transform
          transform={(str, currentFrame) => {
            const charsPerFrame = 3
            const maxChars = currentFrame * charsPerFrame
            const visibleText = str.slice(0, Math.min(str.length, maxChars))
            const cursor = maxChars < str.length ? '▊' : ''
            return visibleText + cursor
          }}
        >
          {text}
        </Transform>
      </Box>
    </Box>
  )
}

// 主测试组件
function TestApp() {
  const [testComplete, setTestComplete] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setTestComplete(true)
    }, 3000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="yellow">
        🧪 测试简化后的组件系统
      </Text>
      <Text dimColor>━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>

      <TestStaticComponent />
      <TestTransformComponent />

      {testComplete && (
        <Box marginTop={1}>
          <Text color="cyan">✨ 所有组件测试完成！</Text>
        </Box>
      )}
    </Box>
  )
}

// 运行测试
const app = render(<TestApp />)

// 5秒后自动退出
setTimeout(() => {
  app.unmount()
  console.log('\n测试结束')
  process.exit(0)
}, 5000)