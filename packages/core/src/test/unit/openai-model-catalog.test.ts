import { describe, expect, test } from 'bun:test'
import { openai } from '#core/constants/models/openai'

describe('OpenAI model catalog', () => {
  test.each([
    ['gpt-5.6', 0.000005, 0.00003],
    ['gpt-5.6-sol', 0.000005, 0.00003],
    ['gpt-5.6-terra', 0.0000025, 0.000015],
    ['gpt-5.6-luna', 0.000001, 0.000006],
  ] as const)(
    'describes %s with current limits and pricing',
    (name, inputCost, outputCost) => {
      const model = openai.find(entry => entry.model === name)

      expect(model).toMatchObject({
        max_input_tokens: 1050000,
        max_output_tokens: 128000,
        input_cost_per_token: inputCost,
        output_cost_per_token: outputCost,
        supports_reasoning_effort: true,
        supports_responses_api: true,
        supports_custom_tools: true,
        supports_allowed_tools: true,
        supports_verbosity_control: true,
      })
    },
  )
})
