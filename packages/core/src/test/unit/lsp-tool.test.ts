import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { LspTool } from '#tools/tools/system/LspTool/LspTool'
import { setCwd } from '#core/utils/state'
import type { ToolUseContext } from '#core/tooling/Tool'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function getSingleResultData(events: unknown[]): Record<string, unknown> {
  const first = asRecord(events[0])
  if (!first || first.type !== 'result') {
    throw new Error('Expected a single result event')
  }
  const data = asRecord(first.data)
  if (!data) throw new Error('Expected result event data')
  return data
}

function makeContext(): ToolUseContext {
  return {
    abortController: new AbortController(),
    messageId: 'm1',
    readFileTimestamps: {},
    options: {
      tools: [],
      commands: [],
      forkNumber: 0,
      messageLogName: 'test',
      verbose: false,
      safeMode: true,
      maxThinkingTokens: 0,
    },
  }
}

describe('LSP tool (compat-aligned)', () => {
  let tempDir: string
  let filePath: string
  let callerFilePath: string
  let unsupportedFilePath: string

  beforeEach(async () => {
    await setCwd(process.cwd())
    tempDir = mkdtempSync(join(tmpdir(), 'kode-lsp-'))
    filePath = join(tempDir, 'sample.ts')
    callerFilePath = join(tempDir, 'caller.ts')
    unsupportedFilePath = join(tempDir, 'sample.py')
    writeFileSync(
      join(tempDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' },
      }),
      'utf8',
    )
    writeFileSync(
      filePath,
      [
        'export function foo() { return 1 }',
        'export function bar() { return foo() }',
        'foo()',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      callerFilePath,
      [
        "import { foo } from './sample'",
        'export function baz() { return foo() }',
        '',
      ].join('\n'),
      'utf8',
    )
    writeFileSync(unsupportedFilePath, 'def foo():\n  return 1\n', 'utf8')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('schema accepts official operations and requires 1-based line/character', () => {
    const base = { filePath: 'x.ts', line: 1, character: 1 as number }
    const ops = [
      'goToDefinition',
      'findReferences',
      'hover',
      'documentSymbol',
      'workspaceSymbol',
      'goToImplementation',
      'prepareCallHierarchy',
      'incomingCalls',
      'outgoingCalls',
    ] as const

    for (const operation of ops) {
      const ok = LspTool.inputSchema.safeParse({ operation, ...base })
      expect(ok.success).toBe(true)
    }

    expect(
      LspTool.inputSchema.safeParse({
        operation: 'goToDefinition',
        filePath: 'x.ts',
        line: 0,
        character: 1,
      }).success,
    ).toBe(false)

    expect(
      LspTool.inputSchema.safeParse({
        operation: 'goToDefinition',
        filePath: 'x.ts',
        line: 1,
        character: 0,
      }).success,
    ).toBe(false)
  })

  test('isEnabled is false when no LSP servers are configured', async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'kode-lsp-empty-'))
    try {
      await setCwd(emptyDir)
      expect(await LspTool.isEnabled()).toBe(false)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  test('uses the local TypeScript fallback when no LSP server is configured', async () => {
    const ctx = makeContext()
    const input = {
      operation: 'goToDefinition',
      filePath,
      line: 2,
      character: 32,
    } as const

    const events: unknown[] = []
    for await (const evt of LspTool.call(input, ctx)) events.push(evt)
    expect(events).toHaveLength(1)

    const out = getSingleResultData(events)
    expect(out.operation).toBe('goToDefinition')
    expect(String(out.result ?? '')).toContain('Defined in')
    expect(String(out.result ?? '')).toContain('sample.ts:1')
    expect(out.resultCount).toBe(1)
  })

  test('uses local TypeScript call hierarchy for incoming and outgoing calls', async () => {
    const ctx = makeContext()
    const cases = [
      {
        operation: 'prepareCallHierarchy',
        line: 1,
        character: 17,
        expected: 'foo',
      },
      {
        operation: 'incomingCalls',
        line: 1,
        character: 17,
        expected: 'bar',
      },
      {
        operation: 'outgoingCalls',
        line: 2,
        character: 17,
        expected: 'foo',
      },
      {
        operation: 'outgoingCalls',
        filePath: callerFilePath,
        line: 2,
        character: 17,
        expected: 'called from: 2:32',
      },
    ] as const

    for (const input of cases) {
      const events: unknown[] = []
      for await (const event of LspTool.call(
        {
          ...input,
          filePath: 'filePath' in input ? input.filePath : filePath,
        },
        ctx,
      )) {
        events.push(event)
      }
      expect(events).toHaveLength(1)
      const out = getSingleResultData(events)
      expect(String(out.result ?? '')).toContain(input.expected)
      expect(Number(out.resultCount ?? 0)).toBeGreaterThan(0)
    }
  })

  test('does not apply the TypeScript fallback to unsupported file types', async () => {
    const events: unknown[] = []
    for await (const event of LspTool.call(
      {
        operation: 'goToDefinition',
        filePath: unsupportedFilePath,
        line: 1,
        character: 5,
      },
      makeContext(),
    )) {
      events.push(event)
    }

    const out = getSingleResultData(events)
    expect(String(out.result ?? '')).toContain(
      'No LSP server available for file type: .py',
    )
  })
})
