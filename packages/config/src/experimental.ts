/**
 * Experimental features must be explicitly enabled at process startup so they
 * never appear in normal command discovery by accident.
 */
export const EXPERIMENTAL_VOICE_ENV = 'KODE_EXPERIMENTAL_VOICE'

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled'])

export function isExperimentalVoiceEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const value = env[EXPERIMENTAL_VOICE_ENV]
  return Boolean(value && ENABLED_VALUES.has(value.trim().toLowerCase()))
}
