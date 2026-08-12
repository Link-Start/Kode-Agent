import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'

import { getGlobalConfig, resolveVoiceConfig } from '#core/utils/config'
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
    if (harness.getOutput().includes(expected)) return
    await harness.wait(20)
  }
  throw new Error(`Timed out waiting for ${expected}: ${harness.getOutput()}`)
}

describe('TUI E2E: reviewed voice control delivery', () => {
  let apiKeyEnv = 'MIMO_API_KEY'
  let previousApiKey: string | undefined

  beforeEach(() => {
    const resolved = resolveVoiceConfig(getGlobalConfig().voice)
    if (!resolved.ok) throw new Error(resolved.message)
    apiKeyEnv = resolved.config.apiKeyEnv
    previousApiKey = process.env[apiKeyEnv]
    process.env[apiKeyEnv] = 'test-key'
  })

  afterEach(async () => {
    await harnessManager.cleanup()
    mock.restore()
    if (previousApiKey === undefined) delete process.env[apiKeyEnv]
    else process.env[apiKeyEnv] = previousApiKey
  })

  test('records, streams a transcript, reviews it, then guides the selected Agent', async () => {
    mock.module('@kode/runtime', () => ({
      startMacOSVoiceRecording: async () => ({
        stop: async () => ({
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: 'audio/wav',
          durationMs: 500,
        }),
        cancel: async () => {},
      }),
    }))
    mock.module('@kode/ai', () => ({
      VoiceConfigurationError: class VoiceConfigurationError extends Error {},
      createMiMoVoiceProvider: () => ({
        async *transcribeStream() {
          yield 'Prioritize '
          yield 'the cancellation race.'
        },
      }),
    }))
    mock.module('#cli-services/voice', () => ({
      interruptVoicePlayback: () => false,
    }))

    const submitted: string[] = []
    let doneResult: unknown = null
    const { VoiceScreen } = await import('#ui-ink/screens/overlays/VoiceScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <VoiceScreen
          onDone={result => {
            doneResult = result
          }}
          submission={{
            destination: 'running Agent agent-1',
            async submit(transcript) {
              submitted.push(transcript)
              return 'Guidance queued.'
            },
          }}
        />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Press Enter to begin recording')
    h.stdin.write('\r')
    await waitForOutput(h, '● Listening')
    h.stdin.write('\r')
    await waitForOutput(h, 'Prioritize the cancellation race.')
    await waitForOutput(h, 'send it to running Agent agent-1')
    // The test harness writes transcript-sized chunks like a paste. Let the
    // input's paste guard settle before the explicit submit key.
    await h.wait(100)
    h.stdin.write('\r')
    await h.wait(80)

    expect(submitted).toEqual(['Prioritize the cancellation race.'])
    expect(doneResult).toBe('Guidance queued.')
  })
})
