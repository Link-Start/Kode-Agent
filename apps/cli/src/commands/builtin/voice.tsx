import React from 'react'

import type { Command } from '../types'
import {
  getGlobalConfig,
  isExperimentalVoiceEnabled,
  redactVoiceConfig,
  resolveVoiceConfig,
  saveGlobalConfig,
} from '#core/utils/config'
import { interruptVoicePlayback } from '#cli-services/voice'
import { VoiceScreen } from '#ui-ink/screens/overlays/VoiceScreen'
import { VoiceSettingsScreen } from '#ui-ink/screens/overlays/VoiceSettingsScreen'

const USAGE = [
  'Usage:',
  '  /voice                         Record, transcribe, review, and send a voice prompt',
  '  /voice status                  Show sanitized voice status',
  '  /voice stop                    Stop the current spoken reply',
  '  /voice config                  Open the keyboard-driven settings screen',
  '  /voice config set <field> <value>',
  '  /voice config reset',
  '',
  'Fields: base-url, api-key-env, asr-model, tts-model, tts-voice, language,',
  '        speak-responses, max-recording-seconds, max-reply-characters',
  '',
  'Example: /voice config set api-key-env MIMO_API_KEY',
  'Then set MIMO_API_KEY in your shell. Keys are never accepted or persisted by this command.',
].join('\n')

function voiceStatus(): string {
  const resolved = resolveVoiceConfig(getGlobalConfig().voice)
  return resolved.ok
    ? JSON.stringify(redactVoiceConfig(resolved.config), null, 2)
    : `Voice configuration is invalid: ${resolved.message}`
}

function configValue(
  field: string,
  value: string,
): Record<string, unknown> | { error: string } {
  switch (field) {
    case 'base-url':
      return { baseURL: value }
    case 'api-key-env':
      return { apiKeyEnv: value }
    case 'asr-model':
      return { asrModel: value }
    case 'tts-model':
      return { ttsModel: value }
    case 'tts-voice':
      return { ttsVoice: value }
    case 'language':
      return { language: value }
    case 'speak-responses':
      if (value === 'true') return { speakResponses: true }
      if (value === 'false') return { speakResponses: false }
      return { error: 'speak-responses must be true or false.' }
    case 'max-recording-seconds':
      if (!/^\d+$/u.test(value)) {
        return { error: 'max-recording-seconds must be an integer.' }
      }
      return { maxRecordingSeconds: Number(value) }
    case 'max-reply-characters':
      if (!/^\d+$/u.test(value)) {
        return { error: 'max-reply-characters must be an integer.' }
      }
      return { maxReplyCharacters: Number(value) }
    default:
      return { error: `Unknown voice configuration field: ${field}` }
  }
}

export function updateVoiceConfiguration(args: string): string {
  const tokens = args.trim().split(/\s+/u).filter(Boolean)
  if (tokens[0] !== 'config') return USAGE
  if (tokens.length === 1) return `${voiceStatus()}\n\n${USAGE}`
  if (tokens[1] === 'reset' && tokens.length === 2) {
    saveGlobalConfig({ ...getGlobalConfig(), voice: undefined })
    return 'Voice configuration was reset to the built-in MiMo defaults. Set the API key environment variable before recording.'
  }
  if (tokens[1] !== 'set' || tokens.length < 4) return USAGE

  const field = tokens[2]!
  const value = tokens.slice(3).join(' ').trim()
  const patch = configValue(field, value)
  if ('error' in patch) return `${patch.error}\n\n${USAGE}`

  const current = resolveVoiceConfig(getGlobalConfig().voice)
  if (!current.ok) {
    return `Existing voice configuration is invalid: ${current.message}\nUse /voice config reset before setting individual fields.`
  }
  const validated = resolveVoiceConfig({ ...current.config, ...patch })
  if (!validated.ok) {
    return `Voice configuration was not saved: ${validated.message}`
  }
  saveGlobalConfig({ ...getGlobalConfig(), voice: validated.config })
  return `Voice configuration updated.\n${JSON.stringify(redactVoiceConfig(validated.config), null, 2)}`
}

const voice = {
  type: 'local-jsx',
  name: 'voice',
  description: 'Experimental: start a MiMo ASR/TTS voice conversation (macOS)',
  argumentHint: 'status|stop|config ...',
  // Restart with KODE_EXPERIMENTAL_VOICE=1 to expose /voice in discovery.
  isEnabled: isExperimentalVoiceEnabled(),
  isHidden: false,
  disableNonInteractive: true,
  ui: { displayMode: 'fullscreen' },
  async call(onDone, _context, args = '') {
    const command = args.trim()
    if (command === 'config') {
      return React.createElement(VoiceSettingsScreen, { onDone })
    }
    if (command === 'status') {
      onDone(voiceStatus())
      return null
    }
    if (command === 'stop') {
      onDone(
        interruptVoicePlayback()
          ? 'Stopped the current spoken reply.'
          : 'No spoken reply is playing.',
      )
      return null
    }
    if (command) {
      onDone(updateVoiceConfiguration(command))
      return null
    }
    return React.createElement(VoiceScreen, { onDone })
  },
  userFacingName() {
    return 'voice'
  },
} satisfies Command

export { USAGE }
export default voice
