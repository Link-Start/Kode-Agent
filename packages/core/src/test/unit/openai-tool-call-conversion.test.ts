import { describe, expect, test } from 'bun:test'
import type OpenAI from 'openai'

import { convertOpenAIResponseToAnthropic } from '#core/ai/llm/openai/conversion'
import { API_ERROR_MESSAGE_PREFIX } from '#core/ai/llm/constants'

function completionWithToolCalls(
  toolCalls: OpenAI.ChatCompletionMessageToolCall[],
): OpenAI.ChatCompletion {
  return {
    id: 'chatcmpl_test',
    object: 'chat.completion',
    created: 1,
    model: 'test-model',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
          refusal: null,
        },
        logprobs: null,
      },
    ],
  } as OpenAI.ChatCompletion
}

describe('OpenAI tool-call conversion safety', () => {
  test('accepts function tool calls even when type is omitted', () => {
    const message = convertOpenAIResponseToAnthropic(
      completionWithToolCalls([
        {
          id: 'call_1',
          type: undefined,
          function: {
            name: 'Bash',
            arguments: '{"command":"echo hi"}',
          },
        } as unknown as OpenAI.ChatCompletionMessageToolCall,
      ]),
    )
    expect(message.content).toEqual([
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'Bash',
        input: { command: 'echo hi' },
      },
    ])
  })

  test('drops incomplete JSON tool arguments instead of executing empty objects', () => {
    const message = convertOpenAIResponseToAnthropic(
      completionWithToolCalls([
        {
          id: 'call_bad',
          type: 'function',
          function: {
            name: 'Bash',
            arguments: '{"command":"echo',
          },
        },
      ]),
    )
    expect(message.content.some(block => block.type === 'tool_use')).toBe(false)
    expect(message.content).toContainEqual({
      type: 'text',
      text: expect.stringContaining(API_ERROR_MESSAGE_PREFIX),
      citations: [],
    })
  })

  test('drops non-object tool arguments', () => {
    const message = convertOpenAIResponseToAnthropic(
      completionWithToolCalls([
        {
          id: 'call_array',
          type: 'function',
          function: {
            name: 'Bash',
            arguments: '["not","object"]',
          },
        },
      ]),
    )
    expect(message.content.some(block => block.type === 'tool_use')).toBe(false)
  })

  test('rejects missing, blank, non-string arguments and invalid types', () => {
    const malformedCalls = [
      {
        id: 'call_missing',
        type: 'function',
        function: { name: 'Bash' },
      },
      {
        id: 'call_blank',
        type: 'function',
        function: { name: 'Bash', arguments: '   ' },
      },
      {
        id: 'call_number',
        type: 'function',
        function: { name: 'Bash', arguments: 42 },
      },
      {
        id: 'call_type',
        type: { unexpected: true },
        function: { name: 'Bash', arguments: '{}' },
      },
    ]

    for (const toolCall of malformedCalls) {
      const message = convertOpenAIResponseToAnthropic(
        completionWithToolCalls([
          toolCall as unknown as OpenAI.ChatCompletionMessageToolCall,
        ]),
      )
      expect(message.content.some(block => block.type === 'tool_use')).toBe(
        false,
      )
      expect(
        message.content.some(
          block =>
            block.type === 'text' &&
            block.text.startsWith(API_ERROR_MESSAGE_PREFIX),
        ),
      ).toBe(true)
    }
  })

  test('rejects the entire response when one of multiple tool calls is invalid', () => {
    const message = convertOpenAIResponseToAnthropic(
      completionWithToolCalls([
        {
          id: 'call_valid',
          type: 'function',
          function: { name: 'Bash', arguments: '{"command":"pwd"}' },
        },
        {
          id: 'call_invalid',
          type: 'function',
          function: { name: 'Bash', arguments: '{"command":' },
        },
      ]),
    )

    expect(message.content.some(block => block.type === 'tool_use')).toBe(false)
    expect(
      message.content.some(
        block =>
          block.type === 'text' &&
          block.text.startsWith(API_ERROR_MESSAGE_PREFIX),
      ),
    ).toBe(true)
  })
})
