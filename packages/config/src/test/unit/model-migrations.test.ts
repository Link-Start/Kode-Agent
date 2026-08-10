import { describe, expect, test } from 'bun:test'

import { migrateModelProfilesRemoveId } from '../../models/migrations'
import type { GlobalConfig } from '../../schema'

describe('model profile migrations', () => {
  test('normalizes persisted model identities and references', () => {
    const migrated = migrateModelProfilesRemoveId({
      modelProfiles: [
        {
          id: 'legacy-model-id',
          name: ' Custom model ',
          provider: ' custom-openai ',
          modelName: ' mimo-v2.5-pro ',
          baseURL: ' https://example.test/v1 ',
          apiKey: '',
          apiKeyEnv: ' TEST_KEY ',
          maxTokens: 1024,
          contextLength: 128_000,
          isActive: true,
          createdAt: 1,
        },
      ],
      modelPointers: {
        main: 'legacy-model-id',
        task: ' mimo-v2.5-pro ',
        compact: ' mimo-v2.5-pro ',
        quick: ' mimo-v2.5-pro ',
      },
      defaultModelName: ' mimo-v2.5-pro ',
    } as unknown as GlobalConfig)

    expect(migrated.modelProfiles?.[0]).toMatchObject({
      name: 'Custom model',
      provider: 'custom-openai',
      modelName: 'mimo-v2.5-pro',
      baseURL: 'https://example.test/v1',
      apiKeyEnv: 'TEST_KEY',
    })
    expect(migrated.modelPointers).toEqual({
      main: 'mimo-v2.5-pro',
      task: 'mimo-v2.5-pro',
      compact: 'mimo-v2.5-pro',
      quick: 'mimo-v2.5-pro',
    })
    expect(migrated.defaultModelName).toBe('mimo-v2.5-pro')
  })

  test('fails closed for malformed persisted profiles without losing repairable data', () => {
    const migrated = migrateModelProfilesRemoveId({
      modelProfiles: [
        null,
        'not-a-profile',
        {
          id: 'partial-profile',
          name: 42,
          provider: ' openai ',
          modelName: ' gpt-5 ',
          maxTokens: 0,
          contextLength: Number.NaN,
          isActive: true,
          apiKeyEnv: ['OPENAI_API_KEY'],
        },
      ],
      modelPointers: {
        main: 'partial-profile',
        task: '',
        compact: '',
        quick: '',
      },
    } as unknown as GlobalConfig)

    expect(migrated.modelProfiles).toHaveLength(1)
    expect(migrated.modelProfiles?.[0]).toMatchObject({
      name: '',
      provider: 'openai',
      modelName: 'gpt-5',
      isActive: false,
    })
    expect(migrated.modelProfiles?.[0]?.apiKeyEnv).toBeUndefined()
    expect(migrated.modelProfiles?.[0]).not.toHaveProperty('id')
    expect(migrated.modelPointers?.main).toBe('gpt-5')
  })

  test('replaces a non-array persisted profile collection with a safe default', () => {
    const migrated = migrateModelProfilesRemoveId({
      modelProfiles: { modelName: 'not-an-array' },
    } as unknown as GlobalConfig)

    expect(migrated.modelProfiles).toEqual([])
  })
})
