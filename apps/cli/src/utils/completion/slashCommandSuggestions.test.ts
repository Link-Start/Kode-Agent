import { describe, expect, it } from 'bun:test'
import type { Command } from '#cli-commands'
import { generateSlashCommandSuggestions } from './slashCommandSuggestions'

function makeCommand(
  name: string,
  options: { aliases?: string[]; scope?: 'project' | 'user' } = {},
): Command {
  return {
    type: 'local',
    name,
    description: `${name} command`,
    aliases: options.aliases,
    isEnabled: true,
    isHidden: false,
    async call() {
      return ''
    },
    userFacingName() {
      return name
    },
    ...(options.scope ? { scope: options.scope } : {}),
  } as Command
}

describe('generateSlashCommandSuggestions', () => {
  it('puts curated primary commands before the full categorized catalog', () => {
    const suggestions = generateSlashCommandSuggestions({
      commands: [
        makeCommand('clear'),
        makeCommand('work'),
        makeCommand('inspect'),
        makeCommand('help'),
        makeCommand('model'),
        makeCommand('alpha'),
      ],
      prefix: '',
    })

    expect(suggestions.map(suggestion => suggestion.value)).toEqual([
      'help',
      'model',
      'work',
      'inspect',
      'clear',
      'alpha',
    ])
    expect(suggestions[0]?.displayValue).toBe('/help · Start')
    expect(suggestions[4]?.displayValue).toBe('/clear · Context')
  })

  it('keeps aggregate commands visible while leaf commands stay directly invokable', () => {
    const hiddenGoal = makeCommand('goal')
    hiddenGoal.isHidden = true

    const suggestions = generateSlashCommandSuggestions({
      commands: [makeCommand('work'), hiddenGoal],
      prefix: '',
    })

    expect(suggestions.map(suggestion => suggestion.value)).toEqual(['work'])
  })

  it('prefers a canonical command name over an alias and matches case-insensitively', () => {
    const suggestions = generateSlashCommandSuggestions({
      commands: [
        makeCommand('workspace', { aliases: ['work'] }),
        makeCommand('work'),
      ],
      prefix: 'WO',
    })

    expect(suggestions.map(suggestion => suggestion.value)).toEqual([
      'work',
      'workspace',
    ])
  })

  it('labels project commands as custom without changing their completion value', () => {
    const suggestions = generateSlashCommandSuggestions({
      commands: [makeCommand('release-check', { scope: 'project' })],
      prefix: '',
    })

    expect(suggestions[0]).toMatchObject({
      value: 'release-check',
      displayValue: '/release-check · Custom',
    })
  })
})
