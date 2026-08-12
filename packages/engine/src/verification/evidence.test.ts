import { describe, expect, test } from 'bun:test'
import type { Message } from '../pipeline/types'
import {
  collectGoalVerificationEvidence,
  getTurnVerificationState,
} from './evidence'

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

function userPrompt(text: string): Message {
  return {
    type: 'user',
    uuid: crypto.randomUUID() as never,
    message: { role: 'user', content: text },
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

  test('treats a Skill use as a potential workspace write (fail-closed)', () => {
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
          id: 'skill-1',
          name: 'Skill',
          input: { skillName: 'apply-changes' },
        },
      ]),
    ])

    // The Skill can mutate the workspace, so the earlier passing receipt no
    // longer counts as terminal evidence for the gate.
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

  test('scopes the completion gate to the active human turn', () => {
    const messages: Message[] = [
      userPrompt('Edit a.ts'),
      toolUse([{ id: 'edit-1', name: 'Edit', input: { file_path: 'a.ts' } }]),
      toolResult({}, 'edit-1'),
      userPrompt('Now explain the architecture without changing files.'),
    ]

    expect(getTurnVerificationState(messages)).toMatchObject({
      turnStartMessageIndex: 3,
      hasMutation: false,
      hasTerminalEvidence: false,
      evidence: [],
    })
  })

  test('treats an image-only human message as a new turn boundary', () => {
    const messages: Message[] = [
      userPrompt('Edit a.ts'),
      toolUse([{ id: 'edit-1', name: 'Edit', input: { file_path: 'a.ts' } }]),
      toolResult({}, 'edit-1'),
      userPrompt([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'AA==' },
        },
      ] as never),
    ]

    expect(getTurnVerificationState(messages).hasMutation).toBe(false)
  })

  test('requires terminal evidence after the latest mutation in the active turn', () => {
    const base: Message[] = [
      userPrompt('Implement the change.'),
      toolUse([{ id: 'edit-1', name: 'Edit', input: { file_path: 'a.ts' } }]),
      toolResult({}, 'edit-1'),
    ]

    expect(getTurnVerificationState(base)).toMatchObject({
      turnStartMessageIndex: 0,
      hasMutation: true,
      hasTerminalEvidence: false,
      evidence: [],
    })

    const withStartedVerification = [
      ...base,
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test', run_in_background: true },
        },
      ]),
      toolResult({
        verification: { ...receipt, status: 'started' as const },
      }),
    ]
    expect(getTurnVerificationState(withStartedVerification)).toMatchObject({
      hasMutation: true,
      hasTerminalEvidence: false,
    })

    const withPassedVerification = [
      ...base,
      toolUse([
        {
          id: receipt.toolUseId,
          name: 'Bash',
          input: { command: 'bun test' },
        },
      ]),
      toolResult({ verification: receipt }),
    ]
    expect(getTurnVerificationState(withPassedVerification)).toMatchObject({
      hasMutation: true,
      hasTerminalEvidence: true,
      evidence: [receipt],
    })
  })

  test('does not treat failed or interrupted checks as terminal evidence', () => {
    const base: Message[] = [
      userPrompt('Implement the change.'),
      toolUse([{ id: 'edit-1', name: 'Edit', input: { file_path: 'a.ts' } }]),
      toolResult({}, 'edit-1'),
    ]

    for (const status of ['failed', 'blocked', 'interrupted'] as const) {
      const withNonPassedVerification = [
        ...base,
        toolUse([
          {
            id: receipt.toolUseId,
            name: 'Bash',
            input: { command: 'bun test' },
          },
        ]),
        toolResult({
          verification: { ...receipt, status },
        }),
      ]
      expect(
        getTurnVerificationState(withNonPassedVerification),
      ).toMatchObject({
        hasMutation: true,
        hasTerminalEvidence: false,
        evidence: [{ ...receipt, status }],
      })
    }
  })

  test('does not let an engine recovery prompt hide the original mutation', () => {
    const state = getTurnVerificationState([
      userPrompt('Implement the change.'),
      toolUse([{ id: 'edit-1', name: 'Edit', input: { file_path: 'a.ts' } }]),
      toolResult({}, 'edit-1'),
      userPrompt(
        '<verification-recovery>Run an applicable check.</verification-recovery>',
      ),
    ])

    expect(state.turnStartMessageIndex).toBe(0)
    expect(state.hasMutation).toBe(true)
  })
})
