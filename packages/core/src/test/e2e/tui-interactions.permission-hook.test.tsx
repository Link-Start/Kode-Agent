import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { Text } from 'ink'

import type { CanUseToolFn } from '#core/permissions/canUseTool'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

afterEach(async () => {
  await harnessManager.cleanup()
  mock.restore()
})

describe('useCanUseTool failure handling', () => {
  test('fails closed and settles when permission evaluation throws', async () => {
    mock.module('#core/permissions', () => ({
      hasPermissionsToUseTool: async () => {
        throw new Error('permission backend unavailable')
      },
      findUnreachablePermissionRules: () => [],
      savePermission: () => {},
    }))
    const logModule = await import('#core/utils/log')
    mock.module('#core/utils/log', () => ({
      ...logModule,
      logError: () => {},
    }))
    const { default: useCanUseTool } =
      await import('#ui-ink/hooks/useCanUseTool')
    let canUseTool: CanUseToolFn | undefined

    function Harness(): React.ReactNode {
      canUseTool = useCanUseTool(() => {})
      return <Text>ready</Text>
    }

    const harness = createInkTestHarness(<Harness />)
    harnessManager.track(harness)
    await harness.wait(25)
    expect(canUseTool).toBeDefined()

    const abortController = new AbortController()
    const result = await canUseTool!(
      {} as never,
      {},
      {
        messageId: 'message-1',
        abortController,
        readFileTimestamps: {},
      },
      {} as never,
    )

    expect(result).toEqual({
      result: false,
      message: 'Tool use was denied because the permission check failed.',
    })
    expect(abortController.signal.aborted).toBe(true)
  })
})
