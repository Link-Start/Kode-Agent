import { describe, expect, test } from 'bun:test'

import { DEFAULT_VOICE_CONFIG, resolveVoiceConfig } from '../../voice'
import {
  EXPERIMENTAL_VOICE_ENV,
  isExperimentalVoiceEnabled,
} from '../../experimental'

describe('voice configuration', () => {
  test('keeps voice disabled unless the experimental flag is explicit', () => {
    expect(isExperimentalVoiceEnabled({})).toBe(false)
    expect(isExperimentalVoiceEnabled({ [EXPERIMENTAL_VOICE_ENV]: '1' })).toBe(
      true,
    )
    expect(
      isExperimentalVoiceEnabled({ [EXPERIMENTAL_VOICE_ENV]: 'false' }),
    ).toBe(false)
  })

  test('uses built-in MiMo defaults without storing a credential', () => {
    const resolved = resolveVoiceConfig(undefined)
    expect(resolved).toEqual({ ok: true, config: DEFAULT_VOICE_CONFIG })
  })

  test('fails closed for unsafe endpoints and malformed settings', () => {
    expect(
      resolveVoiceConfig({ baseURL: 'http://api.example.test/v1' }),
    ).toEqual({
      ok: false,
      message:
        'voice.baseURL must use HTTPS (except a loopback development proxy).',
    })
    expect(resolveVoiceConfig({ apiKeyEnv: 'MIMO-KEY' })).toEqual({
      ok: false,
      message: 'voice.apiKeyEnv must be a valid environment variable name.',
    })
    expect(resolveVoiceConfig({ maxRecordingSeconds: 181 })).toEqual({
      ok: false,
      message: 'voice.maxRecordingSeconds must be an integer from 1 to 180.',
    })
  })

  test('allows an explicit loopback development proxy and normalizes values', () => {
    const resolved = resolveVoiceConfig({
      baseURL: 'http://127.0.0.1:4000/v1/',
      apiKeyEnv: ' TEST_MIMO_KEY ',
      language: 'zh',
      speakResponses: false,
    })
    expect(resolved).toEqual({
      ok: true,
      config: {
        ...DEFAULT_VOICE_CONFIG,
        baseURL: 'http://127.0.0.1:4000/v1',
        apiKeyEnv: 'TEST_MIMO_KEY',
        language: 'zh',
        speakResponses: false,
      },
    })
  })
})
