import { describe, expect, test } from 'bun:test'
import {
  getReasoningEffortOptions,
  isReasoningEffortOption,
} from '#ui-ink/components/ModelSelector/flow/options'

describe('ModelSelector reasoning effort options', () => {
  test('exposes GPT-5.6 none, xhigh, and max levels', () => {
    expect(
      getReasoningEffortOptions('openai/gpt-5.6-sol').map(
        option => option.value,
      ),
    ).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  test('keeps conservative options for providers without model-specific levels', () => {
    expect(
      getReasoningEffortOptions('some-reasoning-model').map(
        option => option.value,
      ),
    ).toEqual(['low', 'medium', 'high'])
  })

  test('validates every selectable current effort', () => {
    for (const value of ['none', 'low', 'medium', 'high', 'xhigh', 'max']) {
      expect(isReasoningEffortOption(value)).toBe(true)
    }
    expect(isReasoningEffortOption('ultra')).toBe(false)
  })
})
