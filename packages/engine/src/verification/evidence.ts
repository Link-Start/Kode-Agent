import { isBashCommandReadOnly } from '@kode/permissions/bash'
import type { GoalVerificationEvidence } from '#core/goals'
import type { Message } from '../pipeline/types'
import { classifyVerificationCommand } from './receipt'

const MAX_GOAL_VERIFICATION_EVIDENCE = 12
const NON_MUTATING_TOOL_NAMES = new Set([
  'Architect',
  'AskExpertModel',
  'AskUserQuestion',
  'EnterPlanMode',
  'ExitPlanMode',
  'Glob',
  'Grep',
  'LS',
  'LSP',
  'ListMcpResourcesTool',
  'MCPSearch',
  'Read',
  'ReadMcpResourceTool',
  'Skill',
  'TaskCreate',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'TaskStop',
  'TaskUpdate',
  'Think',
  'TodoWrite',
  'WebFetch',
  'WebSearch',
  'web_search',
])

type ToolUseInfo = {
  name: string
  messageIndex: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readVerificationEvidence(
  value: unknown,
): GoalVerificationEvidence | null {
  const record = asRecord(value)
  if (!record || record.version !== 1) return null
  const kind = record.kind
  const status = record.status
  const toolUseId = record.toolUseId
  const commandDigest = record.commandDigest
  const outputDigest = record.outputDigest
  const recordedAt = record.recordedAt
  if (
    (kind !== 'test' &&
      kind !== 'typecheck' &&
      kind !== 'lint' &&
      kind !== 'build' &&
      kind !== 'check') ||
    (status !== 'passed' &&
      status !== 'failed' &&
      status !== 'blocked' &&
      status !== 'interrupted' &&
      status !== 'started') ||
    typeof toolUseId !== 'string' ||
    !toolUseId ||
    typeof commandDigest !== 'string' ||
    !/^[a-f0-9]{16}$/.test(commandDigest) ||
    typeof outputDigest !== 'string' ||
    !/^[a-f0-9]{16}$/.test(outputDigest) ||
    typeof recordedAt !== 'string' ||
    !Number.isFinite(Date.parse(recordedAt))
  ) {
    return null
  }
  return {
    version: 1,
    kind,
    status,
    toolUseId,
    commandDigest,
    outputDigest,
    recordedAt,
  }
}

function getToolUses(message: Message): Array<{
  id: string
  name: string
  input: Record<string, unknown>
}> {
  if (message.type !== 'assistant') return []
  const content = message.message.content
  if (!Array.isArray(content)) return []
  return content.flatMap(block => {
    const record = asRecord(block)
    const id = record?.id
    const name = record?.name
    const input = asRecord(record?.input)
    if (
      record?.type !== 'tool_use' ||
      typeof id !== 'string' ||
      !id ||
      typeof name !== 'string' ||
      !name ||
      !input
    ) {
      return []
    }
    return [{ id, name, input }]
  })
}

function isMutatingToolUse(args: {
  name: string
  input: Record<string, unknown>
}): boolean {
  if (args.name !== 'Bash') return !NON_MUTATING_TOOL_NAMES.has(args.name)

  const command = args.input.command
  if (typeof command !== 'string') return true
  // Direct verification commands are already represented by a receipt result;
  // treat other shell commands conservatively unless the central permission
  // classifier can prove they are read-only.
  return (
    classifyVerificationCommand(command) === null &&
    !isBashCommandReadOnly(command)
  )
}

function hasMatchingToolResult(message: Message, toolUseId: string): boolean {
  if (message.type !== 'user' || !Array.isArray(message.message.content)) {
    return false
  }
  return message.message.content.some(block => {
    const record = asRecord(block)
    return record?.type === 'tool_result' && record.tool_use_id === toolUseId
  })
}

/**
 * Produces bounded goal-completion evidence from engine-owned tool results.
 * Evidence before the latest detected write is deliberately discarded: a
 * passing command never automatically applies to later source changes.
 */
export function collectGoalVerificationEvidence(
  messages: Message[],
): GoalVerificationEvidence[] {
  const toolUses = new Map<string, ToolUseInfo>()
  const evidence: Array<{
    receipt: GoalVerificationEvidence
    toolUseMessageIndex: number
  }> = []
  let latestMutationMessageIndex = -1

  for (const [messageIndex, message] of messages.entries()) {
    for (const toolUse of getToolUses(message)) {
      toolUses.set(toolUse.id, { name: toolUse.name, messageIndex })
      if (isMutatingToolUse(toolUse)) {
        latestMutationMessageIndex = messageIndex
      }
    }

    if (message.type !== 'user') continue
    const toolResultData = asRecord(message.toolUseResult)?.data
    const receipt = readVerificationEvidence(
      asRecord(toolResultData)?.verification,
    )
    if (!receipt || !hasMatchingToolResult(message, receipt.toolUseId)) {
      continue
    }
    const toolUse = toolUses.get(receipt.toolUseId)
    if (toolUse?.name !== 'Bash') continue
    evidence.push({ receipt, toolUseMessageIndex: toolUse.messageIndex })
  }

  return evidence
    .filter(item => item.toolUseMessageIndex > latestMutationMessageIndex)
    .slice(-MAX_GOAL_VERIFICATION_EVIDENCE)
    .map(item => item.receipt)
}
