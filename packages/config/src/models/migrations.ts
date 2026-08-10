import type { GlobalConfig, ModelPointers, ModelProfile } from '../schema'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(
  record: Record<string, unknown> | null,
  key: string,
): string {
  if (!record) return ''
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function trimConfigString(value: string): string {
  return value.trim()
}

/**
 * Model identifiers are sent to providers verbatim. Normalize the persisted
 * configuration boundary so accidental whitespace neither changes the model
 * identity nor causes a remote request to fail.
 */
function normalizeModelProfile(profile: ModelProfile): ModelProfile {
  const modelName = trimConfigString(profile.modelName)
  const name = trimConfigString(profile.name)
  const provider = trimConfigString(profile.provider)
  const baseURL = profile.baseURL
    ? trimConfigString(profile.baseURL)
    : undefined
  const apiKeyEnv = profile.apiKeyEnv
    ? trimConfigString(profile.apiKeyEnv)
    : undefined
  const { baseURL: _baseURL, apiKeyEnv: _apiKeyEnv, ...rest } = profile

  return {
    ...rest,
    modelName,
    name,
    provider,
    ...(baseURL ? { baseURL } : {}),
    ...(apiKeyEnv ? { apiKeyEnv } : {}),
  }
}

export function migrateModelProfilesRemoveId(
  config: GlobalConfig,
): GlobalConfig {
  if (!config.modelProfiles || config.modelProfiles.length === 0) return config

  const idToModelNameMap = new Map<string, string>()
  const migratedProfiles: ModelProfile[] = config.modelProfiles.map(profile => {
    const raw: unknown = profile
    if (!isRecord(raw)) return profile

    const normalizedProfile = normalizeModelProfile(profile)

    const maybeId = raw['id']
    if (typeof maybeId === 'string' && normalizedProfile.modelName) {
      idToModelNameMap.set(maybeId, normalizedProfile.modelName)
    }

    const { id: _ignored, ...rest } = raw
    return { ...rest, ...normalizedProfile } as ModelProfile
  })

  const migratedPointers: ModelPointers = {
    main: '',
    task: '',
    compact: '',
    quick: '',
  }

  const pointersRaw: unknown = config.modelPointers
  const pointers = isRecord(pointersRaw) ? pointersRaw : null

  const rawMain = trimConfigString(readString(pointers, 'main'))
  const rawTask = trimConfigString(readString(pointers, 'task'))
  const rawQuick = trimConfigString(readString(pointers, 'quick'))
  const rawCompact =
    trimConfigString(readString(pointers, 'compact')) ||
    trimConfigString(readString(pointers, 'reasoning'))

  if (rawMain) migratedPointers.main = idToModelNameMap.get(rawMain) ?? rawMain
  if (rawTask) migratedPointers.task = idToModelNameMap.get(rawTask) ?? rawTask
  if (rawCompact)
    migratedPointers.compact = idToModelNameMap.get(rawCompact) ?? rawCompact
  if (rawQuick)
    migratedPointers.quick = idToModelNameMap.get(rawQuick) ?? rawQuick

  const configRaw: unknown = config
  const configRecord = isRecord(configRaw) ? configRaw : null

  const legacyDefaultModelId = trimConfigString(
    readString(configRecord, 'defaultModelId'),
  )
  const legacyDefaultModelName = trimConfigString(
    readString(configRecord, 'defaultModelName'),
  )

  let defaultModelName: string | undefined = config.defaultModelName
    ? trimConfigString(config.defaultModelName)
    : undefined
  if (legacyDefaultModelId) {
    defaultModelName =
      idToModelNameMap.get(legacyDefaultModelId) ?? legacyDefaultModelId
  } else if (legacyDefaultModelName) {
    defaultModelName = legacyDefaultModelName
  }

  if (!configRecord) {
    return {
      ...config,
      modelProfiles: migratedProfiles,
      modelPointers: migratedPointers,
      defaultModelName,
    }
  }

  const migratedConfig: Record<string, unknown> = { ...configRecord }
  delete migratedConfig['defaultModelId']
  delete migratedConfig['currentSelectedModelId']
  delete migratedConfig['mainAgentModelId']
  delete migratedConfig['taskToolModelId']

  return {
    ...(migratedConfig as unknown as GlobalConfig),
    modelProfiles: migratedProfiles,
    modelPointers: migratedPointers,
    defaultModelName,
  }
}
