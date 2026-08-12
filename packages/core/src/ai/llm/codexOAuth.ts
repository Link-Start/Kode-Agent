import { randomUUID } from 'node:crypto'

import type { AssistantMessage, UserMessage } from '#core/query'
import type { ModelProfile } from '#core/utils/config'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { createAnthropicUsage } from '#core/utils/anthropic'
import { emitAssistantStreamUpdate } from '@kode/tool-interface/assistantStreamUpdate'

import { CodexAppServerClient } from './externalRuntime/codexAppServer'
import {
  buildExternalRuntimePrompt,
  buildExternalRuntimeSystemPrompt,
  getExternalModelId,
  getFinalTextFromExternalItems,
} from './externalRuntime/utils'

type Options = {
  modelProfile: ModelProfile
  toolUseContext?: ToolUseContext
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getThreadId(result: unknown): string {
  if (
    !isRecord(result) ||
    !isRecord(result.thread) ||
    typeof result.thread.id !== 'string'
  ) {
    throw new Error('Codex app-server did not return a thread ID')
  }
  return result.thread.id
}

function getTurnId(result: unknown): string {
  if (
    !isRecord(result) ||
    !isRecord(result.turn) ||
    typeof result.turn.id !== 'string'
  ) {
    throw new Error('Codex app-server did not return a turn ID')
  }
  return result.turn.id
}

/**
 * Reuses the authenticated Codex CLI for actual inference. Kode stores only a
 * provider profile; the OAuth refresh token is never read or copied here.
 */
export async function queryCodexOAuth(
  messages: (UserMessage | AssistantMessage)[],
  systemPrompt: string[],
  _maxThinkingTokens: number,
  _tools: Tool[],
  signal: AbortSignal,
  options: Options,
): Promise<AssistantMessage> {
  const startedAt = Date.now()
  let streamedText = ''
  let emittedStart = false
  let threadId = ''
  let turnId = ''
  let completedTurn: unknown

  const streamOptions = {
    onAssistantStreamUpdate:
      options.toolUseContext?.options?.onAssistantStreamUpdate,
    agentId: options.toolUseContext?.agentId,
    requestId: options.toolUseContext?.requestId,
  }
  const client = new CodexAppServerClient({
    onNotification(method, params) {
      if (method === 'item/agentMessage/delta' && isRecord(params)) {
        if (params.threadId !== threadId || params.turnId !== turnId) return
        const delta = params.delta
        if (typeof delta !== 'string' || delta.length === 0) return
        streamedText += delta
        if (!emittedStart) {
          emittedStart = true
          emitAssistantStreamUpdate(streamOptions, { type: 'start' })
        }
        emitAssistantStreamUpdate(streamOptions, { type: 'text_delta', delta })
      }
      if (method === 'turn/completed' && isRecord(params)) {
        if (params.threadId === threadId) completedTurn = params.turn
      }
    },
    onServerRequest(id, method) {
      if (
        method === 'item/commandExecution/requestApproval' ||
        method === 'item/fileChange/requestApproval'
      ) {
        client.respond(id, { decision: 'decline' })
        return
      }
      // A Kode permission bridge has not been implemented for the remaining
      // experimental server callbacks, so refuse them instead of bypassing Kode.
      client.respondError(
        id,
        'Kode has not enabled this Codex tool bridge for OAuth model profiles.',
      )
    },
  })

  const abort = () => {
    if (threadId && turnId) {
      void client
        .request('turn/interrupt', { threadId, turnId })
        .catch(() => {})
    }
    void client.stop()
  }

  try {
    if (signal.aborted) throw new Error('Codex request was cancelled')
    signal.addEventListener('abort', abort, { once: true })
    await client.start()
    const system = buildExternalRuntimeSystemPrompt(systemPrompt)
    const thread = await client.request('thread/start', {
      cwd: process.cwd(),
      ephemeral: true,
      model: getExternalModelId(options.modelProfile),
      approvalPolicy: 'untrusted',
      sandbox: 'read-only',
      baseInstructions: `${system}\n\nKode owns tool permissions. Do not execute or edit files through Codex tools; explain requested changes in your answer instead.`,
    })
    threadId = getThreadId(thread)
    const turn = await client.request('turn/start', {
      threadId,
      model: getExternalModelId(options.modelProfile),
      effort: options.modelProfile.reasoningEffort ?? null,
      input: [{ type: 'text', text: buildExternalRuntimePrompt(messages) }],
    })
    turnId = getTurnId(turn)

    const deadline = Date.now() + 10 * 60 * 1000
    while (!completedTurn) {
      if (signal.aborted) throw new Error('Codex request was cancelled')
      if (Date.now() >= deadline) {
        throw new Error('Codex app-server timed out while waiting for the turn')
      }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const completed = completedTurn
    if (signal.aborted) throw new Error('Codex request was cancelled')
    const text =
      getFinalTextFromExternalItems(
        isRecord(completed) && Array.isArray(completed.items)
          ? completed.items
          : [],
      ) || streamedText
    if (!text) throw new Error('Codex returned no assistant text')

    return {
      type: 'assistant',
      uuid: randomUUID(),
      costUSD: 0,
      durationMs: Date.now() - startedAt,
      message: {
        id: randomUUID(),
        model: getExternalModelId(options.modelProfile),
        role: 'assistant',
        type: 'message',
        content: [{ type: 'text', text, citations: [] }],
        usage: createAnthropicUsage({
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        }),
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
    }
  } finally {
    signal.removeEventListener('abort', abort)
    await client.stop()
  }
}
