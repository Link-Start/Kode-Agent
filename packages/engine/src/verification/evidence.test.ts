import { describe, expect, test } from 'bun:test'
import type { Message } from '../pipeline/types'
import { collectGoalVerificationEvidence } from './evidence'

const receipt = {
  version: 1 as const,
  kind: 'test' as const,
  status: 'passed' as const,
  toolUseId: 'verify-1',
  commandDigest: 'a'.repeat(16),
  outputDigest: 'b'.repeat(16),
  recordedAt: '2026-08-10T00:00:00.000Z',
}

function toolUse(
  tools: Array<{ id: string; name: string; input: Record<string, unknown> }>,
): Message {
  return {
    type: 'assistant',
    uuid: crypto.randomUUID() as never,
    costUSD: 0,
    durationMs: 0,
    message: {
      id: crypto.randomUUID(),
      model: 'test',
      role: 'assistant',
      type: 'message',
      content: tools.map(tool => ({ type: 'tool_use', ...tool })),
      usage: {} as never,
    },
  }
}

function toolResult(data: unknown, toolUseId = receipt.toolUseId): Message {
  return {
    type: 'user',
    uuid: crypto.randomUUID() as never,
    message: {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUseId,
          content: 'tool output',
        },
      ],
    },
    toolUseResult: { data, resultForAssistant: 'tool output' },
  }
}

describe('goal verification evidence', () => {
  test('keeps a Bash receipt that follows an earlier source write', () => {
    const evidence = collectGoalVerificationEvidence([
      toolUse([
        {
          id: 'edit-1',
          name: 'Edit',
          input: { file_path: '/workspace/a.ts' },
        },
      ]),
      toolResult({}, 'edit-1'),
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test ./packages/engine' },
        },
      ]),
      toolResult({ verification: receipt }),
    ])

    expect(evidence).toEqual([receipt])
  })

  test('drops a receipt after a later file write or non-read-only Bash command', () => {
    const verified = [
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test ./packages/engine' },
        },
      ]),
      toolResult({ verification: receipt }),
    ]

    expect(
      collectGoalVerificationEvidence([
        ...verified,
        toolUse([
          {
            id: 'write-1',
            name: 'Write',
            input: { file_path: '/workspace/a.ts', content: 'changed' },
          },
        ]),
      ]),
    ).toEqual([])
    expect(
      collectGoalVerificationEvidence([
        ...verified,
        toolUse([
          {
            id: 'bash-write-1',
            name: 'Bash',
            input: { command: 'touch /workspace/a.ts' },
          },
        ]),
      ]),
    ).toEqual([])
  })

  test('keeps a receipt after a centrally-classified read-only Bash command', () => {
    const evidence = collectGoalVerificationEvidence([
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test ./packages/engine' },
        },
      ]),
      toolResult({ verification: receipt }),
      toolUse([
        {
          id: 'status-1',
          name: 'Bash',
          input: { command: 'git status --short' },
        },
      ]),
    ])

    expect(evidence).toEqual([receipt])
  })

  test('drops a receipt issued beside a concurrent write', () => {
    const evidence = collectGoalVerificationEvidence([
      toolUse([
        {
          id: 'edit-1',
          name: 'Edit',
          input: { file_path: '/workspace/a.ts' },
        },
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test ./packages/engine' },
        },
      ]),
      toolResult({ verification: receipt }),
    ])

    expect(evidence).toEqual([])
  })

  test('drops a receipt after an unknown tool because it may write the workspace', () => {
    const evidence = collectGoalVerificationEvidence([
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test ./packages/engine' },
        },
      ]),
      toolResult({ verification: receipt }),
      toolUse([
        {
          id: 'mcp-1',
          name: 'mcp',
          input: { server: 'workspace-plugin', tool: 'apply_changes' },
        },
      ]),
    ])

    expect(evidence).toEqual([])
  })

  test('rejects unmatched, malformed, and non-Bash receipt-shaped data', () => {
    expect(
      collectGoalVerificationEvidence([
        toolUse([
          {
            id: 'read-1',
            name: 'Read',
            input: { file_path: '/workspace/a.ts' },
          },
        ]),
        toolResult({ verification: receipt }, 'read-1'),
      ]),
    ).toEqual([])
    expect(
      collectGoalVerificationEvidence([
        toolUse([
          {
            id: receipt.toolUseId,
            name: 'Bash',
            input: { command: 'bun test ./packages/engine' },
          },
        ]),
        toolResult({
          verification: { ...receipt, commandDigest: 'not-a-digest' },
        }),
      ]),
    ).toEqual([])
  })
})
