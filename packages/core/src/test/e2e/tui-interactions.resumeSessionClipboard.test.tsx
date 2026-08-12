import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

const foreignSession = {
  sessionId: 'foreign-session',
  slug: 'foreign-session',
  customTitle: null,
  tag: null,
  summary: 'A session from another project',
  gitBranch: null,
  forkedFromSessionId: null,
  forkRootSessionId: null,
  firstPrompt: null,
  messageExcerpt: null,
  messageCount: 1,
  cwd: '/tmp/other-project',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  modifiedAt: new Date('2026-01-01T00:00:00.000Z'),
}

afterEach(async () => {
  await harnessManager.cleanup()
  mock.restore()
})

describe('TUI E2E regression (Ink render): cross-project resume', () => {
  test('ignores a stale clipboard result after leaving and reopening the cross-project screen', async () => {
    const copyRequests: Array<{
      resolve: () => void
      reject: (error: Error) => void
    }> = []

    mock.module('#protocol/utils/kodeAgentSessionResume', () => ({
      listAllKodeAgentSessions: () => [foreignSession],
      listKodeAgentSessions: () => [],
    }))
    mock.module('#cli-utils/clipboard', () => ({
      copyTextToClipboard: () =>
        new Promise<{ method: 'system'; truncated: false }>(
          (resolve, reject) => {
            copyRequests.push({
              resolve: () => resolve({ method: 'system', truncated: false }),
              reject,
            })
          },
        ),
    }))

    const { ResumeSessionSelector } =
      await import('#ui-ink/components/ResumeSessionSelector')
    const h = createInkTestHarness(
      <KeypressProvider>
        <ResumeSessionSelector
          cwd="/tmp/current-project"
          sessions={[foreignSession]}
          onCancel={() => {}}
          onSelect={() => {}}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(100)
    h.stdin.write('\x01')
    await h.wait(100)
    expect(h.getOutput()).toContain('other-project')

    h.stdin.write('\r')
    await h.wait(50)
    expect(h.getOutput()).toContain('different directory')
    expect(copyRequests).toHaveLength(1)

    h.clearOutput()
    h.stdin.write('\x1b')
    await h.wait(100)
    expect(h.getOutput()).not.toContain('different directory')
    h.stdin.write('\r')
    await h.wait(100)
    expect(copyRequests).toHaveLength(2)
    expect(h.getOutput()).toContain('different directory')

    h.clearOutput()
    copyRequests[0]!.reject(new Error('first clipboard request failed'))
    await h.wait(50)

    expect(h.getOutput()).toBe('')
  })
})
