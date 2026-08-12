import { describe, expect, test } from 'bun:test'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
} from '#core/utils/messages'
import type { Message } from '#core/query'
import {
  appendMessagesForReplState,
  appendReplQueryFailureMessage,
  REPL_QUERY_FAILURE_MESSAGE,
  shouldAppendReplQueryFailure,
} from './useReplQuery'

function makeProgress(toolUseID: string, text: string): Message {
  return createProgressMessage(
    toolUseID,
    new Set([toolUseID]),
    createAssistantMessage(`<tool-progress>${text}</tool-progress>`),
    [],
    [],
  )
}

describe('appendMessagesForReplState', () => {
  test('replaces prior progress for the same tool use', () => {
    const user = createUserMessage('hello')
    const first = makeProgress('tool-1', 'Waiting...')
    const next = makeProgress('tool-1', 'Running...')

    const result = appendMessagesForReplState([user, first], [next])

    expect(result).toHaveLength(2)
    expect(result[0]).toBe(user)
    expect(result[1]).toBe(next)
  })

  test('keeps progress for different tool uses', () => {
    const first = makeProgress('tool-1', 'Running 1')
    const second = makeProgress('tool-2', 'Running 2')

    const result = appendMessagesForReplState([first], [second])

    expect(result).toEqual([first, second])
  })

  test('replaces the earliest matching progress message when legacy duplicates exist', () => {
    const first = makeProgress('tool-1', 'Waiting...')
    const duplicate = makeProgress('tool-1', 'Stale duplicate')
    const next = makeProgress('tool-1', 'Running...')

    const result = appendMessagesForReplState([first, duplicate], [next])

    expect(result).toEqual([next, duplicate])
  })

  test('appends ordinary messages without cloning an empty update', () => {
    const user = createUserMessage('hello')
    const assistant = createAssistantMessage('done')
    const original = [user]

    expect(appendMessagesForReplState(original, [])).toBe(original)
    expect(appendMessagesForReplState(original, [assistant])).toEqual([
      user,
      assistant,
    ])
  })
})

describe('REPL query failures', () => {
  test('adds a safe, retryable API error to the transcript', () => {
    const user = createUserMessage('hello')
    const result = appendReplQueryFailureMessage([user])
    const failure = result.at(-1)

    expect(failure?.type).toBe('assistant')
    if (!failure || failure.type !== 'assistant') {
      throw new Error('Expected an assistant API error message')
    }

    expect(failure.isApiErrorMessage).toBe(true)
    expect(failure.message.content).toEqual([
      {
        type: 'text',
        text: REPL_QUERY_FAILURE_MESSAGE,
        citations: [],
      },
    ])
    expect(REPL_QUERY_FAILURE_MESSAGE).not.toContain('provider token')
  })

  test('does not append a second failure for timeout or cancellation', () => {
    expect(
      shouldAppendReplQueryFailure({
        timedOut: true,
        aborted: true,
        error: new Error('timed out'),
      }),
    ).toBe(false)
    expect(
      shouldAppendReplQueryFailure({
        timedOut: false,
        aborted: true,
        error: new Error('cancelled'),
      }),
    ).toBe(false)
    expect(
      shouldAppendReplQueryFailure({
        timedOut: false,
        aborted: false,
        error: new DOMException('cancelled', 'AbortError'),
      }),
    ).toBe(false)
  })

  test('keeps unclassified errors visible without exposing their details', () => {
    expect(
      shouldAppendReplQueryFailure({
        timedOut: false,
        aborted: false,
        error: new Error('provider token: secret'),
      }),
    ).toBe(true)
    expect(REPL_QUERY_FAILURE_MESSAGE).not.toContain('secret')
  })
})
