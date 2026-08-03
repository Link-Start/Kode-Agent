import { describe, expect, test } from 'bun:test'
import { __installPrintModeSignalAbortForTests } from '#host-cli/entrypoints/cli/print/runSingleTurn'
import { isPrintModeSignalAbortHandlingActive } from '#host-cli/entrypoints/cli/print/signalState'

describe('print mode signal cancellation', () => {
  test('SIGINT aborts the active print turn controller', () => {
    const controller = new AbortController()
    const listenerCountBefore = process.listenerCount('SIGINT')
    const cleanup = __installPrintModeSignalAbortForTests(controller)
    const listenerCountAfterInstall = process.listenerCount('SIGINT')

    try {
      // Verify the install added exactly one SIGINT listener
      expect(listenerCountAfterInstall).toBe(listenerCountBefore + 1)
      process.emit('SIGINT')
      expect(controller.signal.aborted).toBe(true)
    } finally {
      cleanup()
    }

    // After cleanup, exactly one listener should have been removed.
    // Use a delta check to avoid flakiness from other modules
    // (e.g. observationHub) that may register/remove SIGINT listeners.
    const listenerCountAfterCleanup = process.listenerCount('SIGINT')
    expect(listenerCountAfterInstall - listenerCountAfterCleanup).toBe(1)
  })

  test('cleanup removes print turn signal handlers', () => {
    const controller = new AbortController()
    const cleanup = __installPrintModeSignalAbortForTests(controller)
    cleanup()

    process.emit('SIGINT')

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
