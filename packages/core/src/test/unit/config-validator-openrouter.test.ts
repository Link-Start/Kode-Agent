import { describe, expect, test } from 'bun:test'
import {
  getGPT5ConfigRecommendations,
  validateAndRepairGPT5Profile,
} from '#config'

describe('OpenRouter GPT-5 config validation', () => {
  test('repairs missing GPT-5 baseURL to OpenRouter for OpenRouter profiles', () => {
    const repaired = validateAndRepairGPT5Profile({
      name: 'OpenRouter GPT-5',
      provider: 'openrouter',
      modelName: 'openai/gpt-5',
      apiKey: 'test-key',
      maxTokens: 8192,
      contextLength: 128000,
      isActive: true,
      createdAt: 1,
    })

    expect(repaired.baseURL).toBe('https://openrouter.ai/api/v1')
    expect(repaired.validationStatus).toBe('auto_repaired')
  })

  test.each(['none', 'xhigh', 'max'] as const)(
    'preserves GPT-5.6 %s reasoning effort',
    reasoningEffort => {
      const repaired = validateAndRepairGPT5Profile({
        name: 'GPT-5.6 Sol',
        provider: 'openai',
        modelName: 'gpt-5.6-sol',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        maxTokens: 8192,
        contextLength: 128000,
        reasoningEffort,
        isGPT5: true,
        isActive: true,
        createdAt: 1,
      })

      expect(repaired.reasoningEffort).toBe(reasoningEffort)
      expect(repaired.validationStatus).toBe('valid')
    },
  )

  test('does not send GPT-5.6-only effort to an older GPT-5 model', () => {
    const repaired = validateAndRepairGPT5Profile({
      name: 'GPT-5',
      provider: 'openai',
      modelName: 'gpt-5',
      apiKey: 'test-key',
      maxTokens: 8192,
      contextLength: 128000,
      reasoningEffort: 'max',
      isActive: true,
      createdAt: 1,
    })

    expect(repaired.reasoningEffort).toBe('medium')
    expect(repaired.validationStatus).toBe('auto_repaired')
  })

  test('recommends the documented GPT-5.6 context and output limits', () => {
    expect(getGPT5ConfigRecommendations('gpt-5.6-terra')).toMatchObject({
      contextLength: 1050000,
      maxTokens: 128000,
      reasoningEffort: 'medium',
    })
  })
})
