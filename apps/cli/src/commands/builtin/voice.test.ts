import { afterEach, describe, expect, test } from 'bun:test'

import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'

import { updateVoiceConfiguration } from './voice'

const initialConfig = structuredClone(getGlobalConfig())

afterEach(() => {
  saveGlobalConfig(initialConfig)
})

describe('/voice configuration commands', () => {
  test('accepts settings while refusing raw API keys in shell arguments', () => {
    expect(
      updateVoiceConfiguration('config set api-key-env KODE_MIMO_KEY'),
    ).toContain('Voice configuration updated.')
    expect(getGlobalConfig().voice?.apiKeyEnv).toBe('KODE_MIMO_KEY')
    expect(updateVoiceConfiguration('config set api-key wrong')).toContain(
      'never accepted as credentials',
    )
  })

  test('keeps invalid values out of persisted configuration', () => {
    const before = getGlobalConfig().voice
    expect(
      updateVoiceConfiguration('config set max-recording-seconds 999'),
    ).toContain('Voice configuration was not saved')
    expect(getGlobalConfig().voice).toEqual(before)
  })
})
