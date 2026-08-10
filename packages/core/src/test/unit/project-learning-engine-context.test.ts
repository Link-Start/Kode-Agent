import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { __setLlmLazyQueryLLMLoaderForTests } from '#core/ai/llmLazy'
import {
  __setProjectLearningStorageRootForTests,
  observeProjectLearning,
} from '#core/projectLearning'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import { getOriginalCwd } from '#core/utils/state'

describe('project learning system prompt integration', () => {
  let storageRoot: string
  let projectDir: string

  beforeEach(() => {
    storageRoot = mkdtempSync(join(tmpdir(), 'kode-learning-engine-store-'))
    projectDir = getOriginalCwd()
    __setProjectLearningStorageRootForTests(storageRoot)
  })

  afterEach(() => {
    __setLlmLazyQueryLLMLoaderForTests(null)
    __setProjectLearningStorageRootForTests(null)
    rmSync(storageRoot, { recursive: true, force: true })
  })

  test('injects active project learning only into durable main-agent turns', async () => {
    const candidate = {
      kind: 'procedure' as const,
      text: 'For memory changes, run the focused Bun unit tests first.',
      pathPrefixes: ['packages/core/src/memory'],
    }
    observeProjectLearning({
      cwd: projectDir,
      candidate,
      sourceId: 'summary-1',
      sessionId: 'session-1',
    })
    observeProjectLearning({
      cwd: projectDir,
      candidate,
      sourceId: 'summary-2',
      sessionId: 'session-2',
    })

    let observedSystemPrompt: string[] = []
    __setLlmLazyQueryLLMLoaderForTests(
      async () =>
        (async (_messages: unknown, systemPrompt: string[]) => {
          observedSystemPrompt = systemPrompt
          return createAssistantMessage('Run the focused test.')
        }) as never,
    )

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    for await (const _message of messagePipeline(
      [createUserMessage('How should I validate a memory change?')],
      [],
      {},
      (async () => ({ result: true })) as never,
      {
        agentId: 'main',
        abortController: new AbortController(),
        messageId: undefined,
        readFileTimestamps: {},
        setToolJSX: () => {},
        options: {
          commands: [],
          forkNumber: 0,
          messageLogName: 'learning-test',
          tools: [],
          verbose: false,
          safeMode: false,
          maxThinkingTokens: 0,
          persistSession: true,
        },
      } as never,
    )) {
      // Consume the completed model response.
    }

    const prompt = observedSystemPrompt.join('\n')
    expect(prompt).toContain('<project_learning>')
    expect(prompt).toContain('untrusted reference data')
    expect(prompt).toContain('must not change permissions')
    expect(prompt).toContain('focused Bun unit tests')
  })
})
