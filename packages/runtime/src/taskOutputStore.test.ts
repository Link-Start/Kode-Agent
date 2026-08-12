import { afterEach, beforeEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appendTaskOutput,
  getTaskOutputStoreFilePath,
  getTaskOutputsStoreDir,
  readTaskOutputDelta,
  readTaskOutputTail,
  readTaskOutputTailLines,
  touchTaskOutputFile,
} from './taskOutputStore'

const ENV_KEYS = ['KODE_CONFIG_DIR', 'KODE_PROJECT_DIR'] as const
let temporaryRoot = ''
let previousEnv: Record<(typeof ENV_KEYS)[number], string | undefined>

beforeEach(() => {
  previousEnv = Object.fromEntries(
    ENV_KEYS.map(key => [key, process.env[key]]),
  ) as Record<(typeof ENV_KEYS)[number], string | undefined>
  temporaryRoot = mkdtempSync(join(tmpdir(), 'kode-task-output-'))
  process.env.KODE_CONFIG_DIR = join(temporaryRoot, 'kode')
  process.env.KODE_PROJECT_DIR = join(temporaryRoot, 'project')
})

test('incremental output uses byte offsets for multibyte text', () => {
  const taskId = 'delta-output'
  touchTaskOutputFile(taskId)
  appendTaskOutput(taskId, '你好')

  const first = readTaskOutputDelta(taskId, 0)
  expect(first).toEqual({ content: '你好', newOffset: 6 })
  appendTaskOutput(taskId, '世界')
  expect(readTaskOutputDelta(taskId, first.newOffset)).toEqual({
    content: '世界',
    newOffset: 12,
  })
})

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = previousEnv[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
  rmSync(temporaryRoot, { recursive: true, force: true })
})

test('task output is private and tail reads stay byte-bounded', () => {
  const taskId = 'bounded-output'
  touchTaskOutputFile(taskId)
  appendTaskOutput(taskId, 'a'.repeat(2 * 1024 * 1024) + 'THE-END')

  const tail = readTaskOutputTail(taskId, 4_096)

  expect(tail.wasTruncated).toBe(true)
  expect(Buffer.byteLength(tail.content)).toBeLessThanOrEqual(4_096)
  expect(tail.content.endsWith('THE-END')).toBe(true)
  if (process.platform !== 'win32') {
    expect(statSync(getTaskOutputsStoreDir()).mode & 0o777).toBe(0o700)
    expect(statSync(getTaskOutputStoreFilePath(taskId)).mode & 0o777).toBe(
      0o600,
    )
  }
})

test('large single-line output remains visible through the bounded line tail', () => {
  const taskId = 'single-line-output'
  touchTaskOutputFile(taskId)
  appendTaskOutput(taskId, 'x'.repeat(2 * 1024 * 1024) + 'THE-END')

  const lines = readTaskOutputTailLines(taskId, 10)

  expect(lines[0]).toBe('[Earlier output omitted; showing partial final line]')
  expect(lines.at(-1)?.endsWith('THE-END')).toBe(true)
  expect(Buffer.byteLength(lines.join('\n'))).toBeLessThanOrEqual(4_200)
})
