export type ReasoningEffortOption =
  'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type RequestStrategyOption =
  'auto' | 'kode' | 'compat_headers' | 'compat_headers_system' | 'compat_full'

export const REQUEST_STRATEGY_OPTIONS: Array<{
  label: string
  value: RequestStrategyOption
}> = [
  { label: 'Auto (recommended)', value: 'auto' },
  { label: 'Kode default only', value: 'kode' },
  { label: 'Compatibility headers only', value: 'compat_headers' },
  {
    label: 'Compatibility headers + system prompt',
    value: 'compat_headers_system',
  },
  {
    label: 'Compatibility headers + system prompt + baseline tools',
    value: 'compat_full',
  },
]

export const REASONING_EFFORT_OPTIONS: Array<{
  label: string
  value: ReasoningEffortOption
}> = [
  { label: 'Low - Faster responses, less thorough reasoning', value: 'low' },
  { label: 'Medium - Balanced speed and reasoning depth', value: 'medium' },
  {
    label: 'High - Slower responses, more thorough reasoning',
    value: 'high',
  },
]

const GPT56_REASONING_EFFORT_OPTIONS: Array<{
  label: string
  value: ReasoningEffortOption
}> = [
  { label: 'None - Lowest latency, no reasoning', value: 'none' },
  ...REASONING_EFFORT_OPTIONS,
  { label: 'Extra high - Quality-first deep reasoning', value: 'xhigh' },
  { label: 'Max - Maximum effort for the hardest work', value: 'max' },
]

export function isReasoningEffortOption(
  value: string,
): value is ReasoningEffortOption {
  return ['none', 'low', 'medium', 'high', 'xhigh', 'max'].includes(value)
}

export function getReasoningEffortOptions(
  modelName: string,
): Array<{ label: string; value: ReasoningEffortOption }> {
  return modelName.toLowerCase().includes('gpt-5.6')
    ? GPT56_REASONING_EFFORT_OPTIONS
    : REASONING_EFFORT_OPTIONS
}

export type ContextLengthOption = {
  label: string
  value: number
}

export const CONTEXT_LENGTH_OPTIONS: ContextLengthOption[] = [
  { label: '32K tokens', value: 32000 },
  { label: '64K tokens', value: 64000 },
  { label: '128K tokens', value: 128000 },
  { label: '200K tokens', value: 200000 },
  { label: '256K tokens', value: 256000 },
  { label: '300K tokens', value: 300000 },
  { label: '512K tokens', value: 512000 },
  { label: '1000K tokens', value: 1000000 },
  { label: '1050K tokens', value: 1050000 },
  { label: '2000K tokens', value: 2000000 },
  { label: '3000K tokens', value: 3000000 },
  { label: '5000K tokens', value: 5000000 },
  { label: '10000K tokens', value: 10000000 },
]

export const DEFAULT_CONTEXT_LENGTH = 128000

export type MaxTokensOption = {
  label: string
  value: number
}

export const MAX_TOKENS_OPTIONS: MaxTokensOption[] = [
  { label: '1K tokens', value: 1024 },
  { label: '2K tokens', value: 2048 },
  { label: '4K tokens', value: 4096 },
  { label: '8K tokens (recommended)', value: 8192 },
  { label: '16K tokens', value: 16384 },
  { label: '32K tokens', value: 32768 },
  { label: '64K tokens', value: 65536 },
  { label: '128K tokens', value: 131072 },
]

export const DEFAULT_MAX_TOKENS = 8192
