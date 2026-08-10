import { afterEach, describe, expect, test } from 'bun:test'

import {
  __resetLlmLazyRuntimeForTests,
  __setLlmLazyModuleLoaderForTests,
  prewarmLlmRuntime,
  queryLLM,
} from '#core/ai/llmLazy'

describe('LLM runtime warmup', () => {
  afterEach(() => {
    __resetLlmLazyRuntimeForTests()
  })

  test('shares one global initialization between warmup and requests', async () => {
    let loads = 0
    let prepared = 0
    const innerQuery = async () => 'result' as any

    __setLlmLazyModuleLoaderForTests(async () => {
      loads += 1
      return {
        prepareLlmRuntime: () => {
          prepared += 1
        },
        queryLLM: innerQuery,
        queryQuick: innerQuery,
      } as any
    })

    await Promise.all([prewarmLlmRuntime(), prewarmLlmRuntime()])
    expect(loads).toBe(1)
    expect(prepared).toBe(1)

    await queryLLM([], [], 0, [], new AbortController().signal, {
      safeMode: false,
      model: 'main',
      prependCLISysprompt: true,
    })
    expect(loads).toBe(1)
  })

  test('allows a later warmup to retry after a failed initialization', async () => {
    let attempts = 0
    __setLlmLazyModuleLoaderForTests(async () => {
      attempts += 1
      throw new Error('load failed')
    })

    await expect(prewarmLlmRuntime()).rejects.toThrow('load failed')
    await expect(prewarmLlmRuntime()).rejects.toThrow('load failed')
    expect(attempts).toBe(2)
  })
})
