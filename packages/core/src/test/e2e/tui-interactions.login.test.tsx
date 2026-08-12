import { afterEach, describe, expect, test } from 'bun:test'
import React from 'react'

import { LoginScreen } from '#ui-ink/components/LoginScreen'
import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()

async function waitForOutput(
  harness: ReturnType<typeof createInkTestHarness>,
  expected: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (harness.getOutput().includes(expected)) {
      // Ink can write a frame immediately before the matching input effect is
      // committed. Let that effect settle before the caller sends a key.
      await harness.wait(50)
      return
    }
    await harness.wait(20)
  }
  throw new Error(`Timed out waiting for login output: ${expected}`)
}

afterEach(async () => {
  await harnessManager.cleanup()
})

describe('TUI E2E regression (Ink render): login selector', () => {
  test('offers and applies runtime-recommended settings after browser login', async () => {
    let loginStarted = false
    let done = false
    const appliedSettings: Array<{
      model: string
      displayName: string
      reasoningEffort: string
    }> = []

    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {
            done = true
          }}
          pollIntervalMs={10}
          codexAuth={{
            getStatus: async () =>
              loginStarted
                ? { kind: 'authenticated' as const }
                : { kind: 'unauthenticated' as const },
            startLogin: async () => {
              loginStarted = true
            },
            getRecommendedSettings: async () => ({
              model: 'gpt-runtime-default',
              displayName: 'GPT Runtime Default',
              reasoningEffort: 'medium',
            }),
            applyRecommendedSettings: async settings => {
              appliedSettings.push(settings)
            },
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Codex is not signed in yet.')
    expect(h.getOutput()).toContain('Codex / ChatGPT')
    expect(h.getOutput()).toContain('OpenAI API key (GPT-5-Codex)')

    h.stdin.write('\r')
    await waitForOutput(h, "Use Codex's recommended model settings?")

    expect(loginStarted).toBe(true)
    expect(done).toBe(false)
    expect(h.getOutput()).toContain(
      'GPT Runtime Default (gpt-runtime-default) · medium reasoning',
    )

    h.stdin.write('\r')
    await waitForOutput(h, 'Codex is signed in.')
    expect(appliedSettings).toEqual([
      {
        model: 'gpt-runtime-default',
        displayName: 'GPT Runtime Default',
        reasoningEffort: 'medium',
      },
    ])

    h.stdin.write('\r')
    await h.wait(20)
    expect(done).toBe(true)
  })

  test('keeps existing Codex settings when the recommendation is declined', async () => {
    let applyCount = 0

    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {}}
          codexAuth={{
            getStatus: async () => ({ kind: 'authenticated' as const }),
            startLogin: async () => {},
            getRecommendedSettings: async () => ({
              model: 'gpt-runtime-default',
              displayName: 'GPT Runtime Default',
              reasoningEffort: 'medium',
            }),
            applyRecommendedSettings: async () => {
              applyCount += 1
            },
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Codex is already signed in.')
    h.stdin.write('\r')
    await waitForOutput(h, "Use Codex's recommended model settings?")
    h.stdin.write('\u001B[B')
    await h.wait(50)
    h.stdin.write('\r')
    await waitForOutput(h, 'Existing Codex model settings were kept.')

    expect(applyCount).toBe(0)
  })

  test('reports an atomic apply failure and allows an explicit retry', async () => {
    let applyCount = 0

    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {}}
          codexAuth={{
            getStatus: async () => ({ kind: 'authenticated' as const }),
            startLogin: async () => {},
            getRecommendedSettings: async () => ({
              model: 'gpt-runtime-default',
              displayName: 'GPT Runtime Default',
              reasoningEffort: 'medium',
            }),
            applyRecommendedSettings: async () => {
              applyCount += 1
              if (applyCount === 1) throw new Error('simulated write failure')
            },
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Codex is already signed in.')
    h.stdin.write('\r')
    await waitForOutput(h, "Use Codex's recommended model settings?")
    h.stdin.write('\r')
    await waitForOutput(h, 'settings update could not be confirmed')
    expect(applyCount).toBe(1)

    h.stdin.write('\r')
    await waitForOutput(h, 'Codex is signed in.')
    expect(applyCount).toBe(2)
  })

  test('opens the OpenAI API-key setup directly from the login selector', async () => {
    const h = createInkTestHarness(
      <KeypressProvider>
        <LoginScreen
          onDone={() => {}}
          codexAuth={{
            getStatus: async () => ({ kind: 'authenticated' as const }),
            startLogin: async () => {},
            getRecommendedSettings: async () => ({
              model: 'gpt-runtime-default',
              displayName: 'GPT Runtime Default',
              reasoningEffort: 'medium',
            }),
            applyRecommendedSettings: async () => {},
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Codex is already signed in.')
    h.stdin.write('\u001B[B')
    await waitForOutput(h, 'Configure an OpenAI model profile')
    h.stdin.write('\r')
    await waitForOutput(h, 'Credential Source / 凭据来源')

    const output = h.getOutput()
    expect(output).toContain('Credential Source / 凭据来源')
    expect(output).toContain(
      'Paste a key to save it in Kode credential storage.',
    )
  })
})
