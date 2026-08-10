import type { Command } from '#cli-commands'
import {
  compareCommandsForDiscovery,
  getCommandCategory,
} from '#cli-commands/catalog'
import type { UnifiedSuggestion } from './types'

function buildCommandDescription(cmd: Command): string {
  const parts: string[] = []
  if (cmd.description) parts.push(cmd.description)
  if (cmd.argumentHint) parts.push(`Args: ${cmd.argumentHint}`)
  return parts.join('\n')
}

function buildCommandDisplayValue(cmd: Command): string {
  const category = getCommandCategory(cmd)
  return `/${cmd.userFacingName()} · ${category.shortLabel}`
}

function getCommandMatchRank(command: Command, prefix: string): number | null {
  const normalizedPrefix = prefix.toLowerCase()
  const name = command.userFacingName().toLowerCase()

  if (name === normalizedPrefix) return 0
  if (name.startsWith(normalizedPrefix)) return 1
  if (
    command.aliases?.some(alias =>
      alias.toLowerCase().startsWith(normalizedPrefix),
    )
  ) {
    return 2
  }
  return null
}

export function generateSlashCommandSuggestions(args: {
  commands: Command[]
  prefix: string
}): UnifiedSuggestion[] {
  const { commands, prefix } = args
  const filteredCommands = commands.filter(cmd => !cmd.isHidden)

  if (!prefix) {
    return filteredCommands.sort(compareCommandsForDiscovery).map(cmd => ({
      value: cmd.userFacingName(),
      displayValue: buildCommandDisplayValue(cmd),
      description: buildCommandDescription(cmd),
      type: 'command' as const,
      score: 100,
    }))
  }

  return filteredCommands
    .map(command => ({
      command,
      matchRank: getCommandMatchRank(command, prefix),
    }))
    .filter(
      (match): match is { command: Command; matchRank: number } =>
        match.matchRank !== null,
    )
    .sort((a, b) => {
      const matchOrder = a.matchRank - b.matchRank
      return matchOrder !== 0
        ? matchOrder
        : compareCommandsForDiscovery(a.command, b.command)
    })
    .map(({ command, matchRank }) => ({
      value: command.userFacingName(),
      displayValue: buildCommandDisplayValue(command),
      description: buildCommandDescription(command),
      type: 'command' as const,
      score: 300 - matchRank * 100 - prefix.length,
    }))
}
