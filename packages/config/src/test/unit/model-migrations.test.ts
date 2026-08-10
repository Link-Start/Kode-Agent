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
})
