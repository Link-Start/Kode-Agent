import { describe, expect, test } from 'bun:test'

import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'

import {
  buildHeadlessToolPermissionContext,
  InvalidHeadlessPermissionModeError,
} from './headlessPermissionContext'

describe('buildHeadlessToolPermissionContext', () => {
  test('applies CLI rules, directories, and permission mode', () => {
    const context = buildHeadlessToolPermissionContext({
      baseContext: createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      }),
      allowedTools: ['Read, Write(/tmp/output.html)'],
      disallowedTools: 'Bash,WebFetch',
      addDir: ['/tmp/generated,/tmp/assets'],
      permissionMode: 'acceptEdits',
      inputFormat: 'text',
      hasPermissionPromptTool: false,
    })

    expect(context.mode).toBe('acceptEdits')
    expect(context.alwaysAllowRules.cliArg).toEqual([
      'Read',
      'Write(/tmp/output.html)',
    ])
    expect(context.alwaysDenyRules.cliArg).toEqual(['Bash', 'WebFetch'])
    expect([...context.additionalWorkingDirectories.keys()]).toEqual([
      '/tmp/generated',
      '/tmp/assets',
    ])
  })

  test('keeps safe text runs interactive instead of silently bypassing', () => {
    const baseContext = createDefaultToolPermissionContext()
    baseContext.mode = 'default'

    const context = buildHeadlessToolPermissionContext({
      baseContext,
      safe: true,
      inputFormat: 'text',
      hasPermissionPromptTool: false,
    })

    expect(context.mode).toBe('default')
  })

  test('preserves legacy non-interactive auto bypass behavior', () => {
    const baseContext = createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: true,
    })
    baseContext.mode = 'default'

    const context = buildHeadlessToolPermissionContext({
      baseContext,
      inputFormat: 'text',
      hasPermissionPromptTool: false,
    })

    expect(context.mode).toBe('bypassPermissions')
  })

  test('does not let auto bypass override explicit CLI permission boundaries', () => {
    for (const rules of [
      { allowedTools: 'Read(output.html)' },
      { disallowedTools: 'Bash' },
      { addDir: '/tmp/generated' },
    ]) {
      const baseContext = createDefaultToolPermissionContext({
        isBypassPermissionsModeAvailable: true,
      })
      baseContext.mode = 'default'

      const context = buildHeadlessToolPermissionContext({
        baseContext,
        ...rules,
        inputFormat: 'text',
        hasPermissionPromptTool: false,
      })

      expect(context.mode).toBe('default')
    }
  })

  test('maps delegate to default and rejects unknown modes', () => {
    const delegated = buildHeadlessToolPermissionContext({
      baseContext: createDefaultToolPermissionContext(),
      permissionMode: 'delegate',
      inputFormat: 'text',
      hasPermissionPromptTool: false,
    })
    expect(delegated.mode).toBe('default')

    expect(() =>
      buildHeadlessToolPermissionContext({
        baseContext: createDefaultToolPermissionContext(),
        permissionMode: 'unsafe-forever',
        inputFormat: 'text',
        hasPermissionPromptTool: false,
      }),
    ).toThrow(InvalidHeadlessPermissionModeError)
  })
})
