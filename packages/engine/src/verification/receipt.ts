import { createHash } from 'node:crypto'

export type VerificationKind = 'test' | 'typecheck' | 'lint' | 'build' | 'check'

export type VerificationStatus =
  'passed' | 'failed' | 'blocked' | 'interrupted' | 'started'

export type VerificationReceipt = {
  version: 1
  kind: VerificationKind
  status: VerificationStatus
  toolUseId: string
  commandDigest: string
  outputDigest: string
  recordedAt: string
}

type BashOutput = {
  stdout?: unknown
  stderr?: unknown
  interrupted?: unknown
  backgroundTaskId?: unknown
  bashId?: unknown
  returnCodeInterpretation?: unknown
}

const CONTROL_OPERATOR_RE = /[;&|`$()<>\r\n]/
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=[^\s]+$/
const INFORMATION_ONLY_FLAGS = new Set(['--help', '-h', '--version', '-v'])

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function normalizeCommand(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed || CONTROL_OPERATOR_RE.test(trimmed)) return null
  return trimmed.replace(/\s+/g, ' ')
}

function classifyScriptName(
  value: string | undefined,
): VerificationKind | null {
  if (!value) return null
  if (value === 'check') return 'check'
  if (value === 'typecheck') return 'typecheck'
  if (value === 'lint') return 'lint'
  if (value === 'build') return 'build'
  if (value === 'test' || value.startsWith('test:')) return 'test'
  return null
}

export function classifyVerificationCommand(
  command: string,
): VerificationKind | null {
  const normalized = normalizeCommand(command)
  if (!normalized) return null

  const parts = normalized.split(' ')
  let index = 0
  if (parts[index] === 'env') index += 1
  while (index < parts.length && ENV_ASSIGNMENT_RE.test(parts[index]!)) {
    index += 1
  }

  const executable = parts[index]
  const args = parts.slice(index + 1)
  if (!executable) return null
  if (args.some(argument => INFORMATION_ONLY_FLAGS.has(argument))) return null

  if (executable === 'bun' || executable === 'npm' || executable === 'pnpm') {
    if (args[0] === 'test') return 'test'
    if (args[0] === 'run') return classifyScriptName(args[1])
    return null
  }

  if (executable === 'yarn') {
    if (args[0] === 'test') return 'test'
    return classifyScriptName(args[0])
  }

  if (
    executable === 'vitest' ||
    executable === 'jest' ||
    executable === 'pytest' ||
    executable === 'mocha' ||
    executable === 'ava'
  ) {
    return 'test'
  }

  if (
    executable === 'tsc' ||
    executable === 'pyright' ||
    executable === 'mypy'
  ) {
    return 'typecheck'
  }

  if (executable === 'eslint' || executable === 'golangci-lint') return 'lint'
  if (executable === 'biome' && args[0] === 'check') return 'lint'
  if (executable === 'ruff' && args[0] === 'check') return 'lint'

  if (executable === 'go') {
    if (args[0] === 'test') return 'test'
    if (args[0] === 'vet') return 'typecheck'
    if (args[0] === 'build') return 'build'
    return null
  }

  if (executable === 'cargo') {
    if (args[0] === 'test') return 'test'
    if (args[0] === 'check') return 'typecheck'
    if (args[0] === 'build') return 'build'
    return null
  }

  if (executable === 'mvn' || executable === './mvnw') {
    if (args.includes('test')) return 'test'
    if (args.includes('verify')) return 'check'
    if (args.includes('compile') || args.includes('package')) return 'build'
    return null
  }

  if (executable === 'gradle' || executable === './gradlew') {
    if (args.includes('test')) return 'test'
    if (args.includes('check')) return 'check'
    if (args.includes('build')) return 'build'
    return null
  }

  return null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function classifyVerificationStatus(output: BashOutput): VerificationStatus {
  if (output.backgroundTaskId || output.bashId) return 'started'
  if (output.interrupted === true) return 'interrupted'

  const stderr = readString(output.stderr)
  const interpretation = readString(output.returnCodeInterpretation)
  const diagnostic = `${stderr}\n${interpretation}`
  if (/\bExit code\s+[1-9]\d*\b/i.test(diagnostic)) return 'failed'
  if (
    /(?:^|\n)(?:Blocked:|This command must run|Command failed:|Command cancelled)/i.test(
      diagnostic,
    )
  ) {
    return 'blocked'
  }
  return 'passed'
}

export function createVerificationReceipt(args: {
  toolName: string
  isTrustedExecutionTool: boolean
  toolUseId: string
  input: Record<string, unknown>
  output: unknown
  now?: Date
}): VerificationReceipt | null {
  if (args.toolName !== 'Bash' || !args.isTrustedExecutionTool) return null
  const command = args.input.command
  if (typeof command !== 'string') return null
  const normalized = normalizeCommand(command)
  const kind = normalized ? classifyVerificationCommand(normalized) : null
  if (!normalized || !kind || !args.output || typeof args.output !== 'object') {
    return null
  }

  const output = args.output as BashOutput
  const outputMaterial = [
    readString(output.stdout),
    readString(output.stderr),
    readString(output.returnCodeInterpretation),
  ].join('\u0000')

  return {
    version: 1,
    kind,
    status: classifyVerificationStatus(output),
    toolUseId: args.toolUseId,
    commandDigest: digest(normalized),
    outputDigest: digest(outputMaterial),
    recordedAt: (args.now ?? new Date()).toISOString(),
  }
}

export function attachVerificationReceipt<T>(
  output: T,
  receipt: VerificationReceipt | null,
): T {
  if (
    !receipt ||
    !output ||
    typeof output !== 'object' ||
    Array.isArray(output)
  ) {
    return output
  }
  return { ...(output as Record<string, unknown>), verification: receipt } as T
}

export function formatVerificationSystemMessage(
  receipt: VerificationReceipt,
): string {
  return [
    '# Verification receipt (engine generated)',
    `The exact ${receipt.kind} command completed with status ${receipt.status} at ${receipt.recordedAt}.`,
    `Command digest: ${receipt.commandDigest}; output digest: ${receipt.outputDigest}.`,
    'This proves only the recorded command outcome. It does not prove coverage of later edits, unselected tests, deployment, or external side effects.',
    receipt.status === 'passed'
      ? 'You may report this exact command as passed only if no relevant code changed after it; otherwise run an applicable verification again.'
      : 'Do not report this verification as passed. Explain the recorded state and continue with an appropriate safe next step.',
  ].join('\n')
}
