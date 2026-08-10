import { describe, expect, test } from 'bun:test'
import { __installPrintModeSignalAbortForTests } from '#host-cli/entrypoints/cli/print/runSingleTurn'
import { isPrintModeSignalAbortHandlingActive } from '#host-cli/entrypoints/cli/print/signalState'

describe('print mode signal cancellation', () => {
  test('SIGINT aborts the active print turn controller', () => {
    const controller = new AbortController()
    const listenersBefore = new Set(process.listeners('SIGINT'))
    const cleanup = __installPrintModeSignalAbortForTests(controller)
    const installedListeners = process
      .listeners('SIGINT')
      .filter(listener => !listenersBefore.has(listener))

    try {
      expect(installedListeners).toHaveLength(1)
      installedListeners[0]!('SIGINT')
      expect(controller.signal.aborted).toBe(true)
    } finally {
      cleanup()
    }

    expect(process.listeners('SIGINT')).not.toContain(installedListeners[0])
  })

  test('cleanup removes print turn signal handlers', () => {
    const controller = new AbortController()
    const listenersBefore = new Set(process.listeners('SIGINT'))
    const cleanup = __installPrintModeSignalAbortForTests(controller)
    const installedListeners = process
      .listeners('SIGINT')
      .filter(listener => !listenersBefore.has(listener))
    cleanup()

    expect(installedListeners).toHaveLength(1)
    expect(process.listeners('SIGINT')).not.toContain(installedListeners[0])
    expect(controller.signal.aborted).toBe(false)
  })

  test('tracks active print signal handling for global handler deferral', () => {
    const controller = new AbortController()
    expect(isPrintModeSignalAbortHandlingActive()).toBe(false)

    const cleanup = __installPrintModeSignalAbortForTests(controller)
    try {
      expect(isPrintModeSignalAbortHandlingActive()).toBe(true)
    } finally {
      cleanup()
    }

    expect(isPrintModeSignalAbortHandlingActive()).toBe(false)
  })
})
