import type { PermissionMode } from '#core/types/PermissionMode'
import type {
  ToolPermissionContext,
  ToolPermissionContextUpdate,
} from '#core/types/toolPermissionContext'
import { applyToolPermissionContextUpdates } from '#core/types/toolPermissionContext'

export class InvalidHeadlessPermissionModeError extends Error {
  constructor(readonly permissionMode: string) {
    super(
      `Invalid --permission-mode "${permissionMode}". Expected one of: acceptEdits, bypassPermissions, default, delegate, dontAsk, plan`,
    )
    this.name = 'InvalidHeadlessPermissionModeError'
  }
}

function cliRuleList(value: unknown): string[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : [value]
  return raw
    .flatMap(item => String(item ?? '').split(','))
    .map(item => item.trim())
    .filter(Boolean)
}

function isPermissionMode(value: string): value is PermissionMode {
  return (
    value === 'acceptEdits' ||
    value === 'bypassPermissions' ||
    value === 'default' ||
    value === 'dontAsk' ||
    value === 'plan'
  )
}

function hasRuleEntries(
  groups: ToolPermissionContext['alwaysAllowRules'],
): boolean {
  return Object.values(groups).some(
    rules => Array.isArray(rules) && rules.length > 0,
  )
}

export function buildHeadlessToolPermissionContext(args: {
  baseContext: ToolPermissionContext
  safe?: boolean
  allowedTools?: unknown
  disallowedTools?: unknown
  addDir?: unknown
  permissionMode?: string
  dangerouslySkipPermissions?: boolean
  inputFormat: string
  hasPermissionPromptTool: boolean
}): ToolPermissionContext {
  const updates: ToolPermissionContextUpdate[] = []
  const allowedRules = cliRuleList(args.allowedTools)
  const deniedRules = cliRuleList(args.disallowedTools)
  const additionalDirs = cliRuleList(args.addDir)

  if (allowedRules.length > 0) {
    updates.push({
      type: 'addRules',
      destination: 'cliArg',
      behavior: 'allow',
      rules: allowedRules,
    })
  }
  if (deniedRules.length > 0) {
    updates.push({
      type: 'addRules',
      destination: 'cliArg',
      behavior: 'deny',
      rules: deniedRules,
    })
  }
  if (additionalDirs.length > 0) {
    updates.push({
      type: 'addDirectories',
      destination: 'cliArg',
      directories: additionalDirs,
    })
  }

  const normalizedPermissionMode =
    typeof args.permissionMode === 'string' ? args.permissionMode.trim() : ''
  const hasCustomPermissions =
    allowedRules.length > 0 ||
    deniedRules.length > 0 ||
    additionalDirs.length > 0 ||
    args.baseContext.additionalWorkingDirectories.size > 0 ||
    hasRuleEntries(args.baseContext.alwaysAllowRules) ||
    hasRuleEntries(args.baseContext.alwaysDenyRules) ||
    hasRuleEntries(args.baseContext.alwaysAskRules)
  const shouldAutoBypassForNonInteractive =
    !normalizedPermissionMode &&
    args.baseContext.mode === 'default' &&
    !hasCustomPermissions &&
    !args.safe &&
    args.inputFormat !== 'stream-json' &&
    !args.hasPermissionPromptTool

  if (shouldAutoBypassForNonInteractive) {
    updates.push({
      type: 'setMode',
      destination: 'cliArg',
      mode: 'bypassPermissions',
    })
  }

  if (normalizedPermissionMode) {
    const normalized =
      normalizedPermissionMode === 'delegate'
        ? 'default'
        : normalizedPermissionMode
    if (!isPermissionMode(normalized)) {
      throw new InvalidHeadlessPermissionModeError(normalizedPermissionMode)
    }
    updates.push({
      type: 'setMode',
      destination: 'cliArg',
      mode: normalized,
    })
  }

  if (args.dangerouslySkipPermissions) {
    updates.push({
      type: 'setMode',
      destination: 'cliArg',
      mode: 'bypassPermissions',
    })
  }

  return applyToolPermissionContextUpdates(args.baseContext, updates)
}
