import { describe, expect, test } from 'bun:test'

import {
  isNativeVoiceSupported,
  startMacOSPCMPlayback,
  verifyMacOSVoiceRuntime,
} from './macos'

describe('macOS voice runtime', () => {
  test('reports the platform capability consistently', () => {
    expect(isNativeVoiceSupported()).toBe(process.platform === 'darwin')
  })

  test.if(process.platform === 'darwin')(
    'compiles the recorder without requesting microphone access',
    async () => {
      await expect(verifyMacOSVoiceRuntime()).resolves.toBeUndefined()
    },
  )

  test.if(process.platform === 'darwin')(
    'plays a silent framed PCM block through the native streaming player',
    async () => {
      const playback = await startMacOSPCMPlayback({ sampleRate: 24_000 })
      await playback.write(new Uint8Array(480))
      await expect(playback.finish()).resolves.toBeUndefined()
    },
  )
})
