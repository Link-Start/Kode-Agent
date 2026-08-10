/**
 * Resolve OpenAI reasoning_effort without pulling the full thinking pipeline.
 * Mirrors core getReasoningEffort behavior without pulling host configuration.
 * The explicit profile value is authoritative for OpenAI requests; Anthropic
 * thinking-token budgets are intentionally not used to reduce it.
 */
export function resolveReasoningEffort(args: {
  modelProfile?: {
    reasoningEffort?: string
  } | null
  thinkingTokens?: number
  fallbackEffort?: string
}): 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null {
  void args.thinkingTokens
  const raw =
    args.modelProfile?.reasoningEffort ?? args.fallbackEffort ?? 'medium'
  if (!raw) return null
  if (
    raw === 'none' ||
    raw === 'minimal' ||
    raw === 'low' ||
    raw === 'medium' ||
    raw === 'high' ||
    raw === 'xhigh' ||
    raw === 'max'
  ) {
    return raw
  }
  return 'medium'
}
