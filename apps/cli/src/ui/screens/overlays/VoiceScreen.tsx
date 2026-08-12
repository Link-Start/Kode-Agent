import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Text } from 'ink'

import { createMiMoVoiceProvider, VoiceConfigurationError } from '@kode/ai'
import {
  startMacOSVoiceRecording,
  type ActiveVoiceRecording,
} from '@kode/runtime'
import {
  getGlobalConfig,
  readVoiceApiKey,
  resolveVoiceConfig,
  type VoiceConfig,
} from '#core/utils/config'
import { getTheme } from '#core/utils/theme'
import { interruptVoicePlayback } from '#cli-services/voice'
import type { LocalJSXCommandResult } from '#cli-commands/types'
import TextInput from '#ui-ink/components/TextInput'
import { KEYPRESS_PRIORITY } from '#ui-ink/constants/keypressPriority'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'

type VoiceScreenState =
  | { kind: 'ready' }
  | { kind: 'preparing' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'review'; error?: string }
  | { kind: 'submitting' }
  | { kind: 'error'; message: string }

export class VoiceSubmissionError extends Error {
  override name = 'VoiceSubmissionError'
}

export type VoiceTranscriptSubmission = {
  destination: string
  submit(transcript: string): Promise<string> | string
}

function toSafeMessage(error: unknown): string {
  if (error instanceof VoiceConfigurationError) return error.message
  if (error instanceof Error && error.name === 'VoiceRuntimeError')
    return error.message
  return 'Voice could not complete. Check your network, MiMo configuration, and microphone permission.'
}

export function VoiceScreen({
  onDone,
  submission,
}: {
  onDone: (result?: LocalJSXCommandResult) => void
  submission?: VoiceTranscriptSubmission
}): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const { columns } = useTerminalSize()
  const [state, setState] = useState<VoiceScreenState>({ kind: 'ready' })
  const [transcript, setTranscript] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const transcriptRef = useRef('')
  const appendNextRecordingRef = useRef(false)
  const recordingRef = useRef<ActiveVoiceRecording | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const configRef = useRef<VoiceConfig | null>(null)
  const closedRef = useRef(false)

  const close = useCallback(() => {
    closedRef.current = true
    requestRef.current?.abort()
    void recordingRef.current?.cancel()
    recordingRef.current = null
    onDone()
  }, [onDone])

  useEffect(
    () => () => {
      closedRef.current = true
      requestRef.current?.abort()
      void recordingRef.current?.cancel()
    },
    [],
  )

  const startRecording = useCallback(async (appendTranscript = false) => {
    interruptVoicePlayback()
    appendNextRecordingRef.current = appendTranscript
    const resolved = resolveVoiceConfig(getGlobalConfig().voice)
    if (!resolved.ok) {
      setState({ kind: 'error', message: resolved.message })
      return
    }
    if (!readVoiceApiKey(resolved.config)?.trim()) {
      setState({
        kind: 'error',
        message: `Configure ${resolved.config.apiKeyEnv} in the environment or paste it in /voice config before recording. The key is never stored in regular Kode configuration.`,
      })
      return
    }
    setState({ kind: 'preparing' })
    try {
      const recording = await startMacOSVoiceRecording({
        maxRecordingSeconds: resolved.config.maxRecordingSeconds,
      })
      if (closedRef.current) {
        await recording.cancel()
        return
      }
      configRef.current = resolved.config
      recordingRef.current = recording
      setState({ kind: 'recording' })
    } catch (error) {
      if (!closedRef.current)
        setState({ kind: 'error', message: toSafeMessage(error) })
    }
  }, [])

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current
    const config = configRef.current
    if (!recording || !config) return
    recordingRef.current = null
    setState({ kind: 'transcribing' })
    const prefix = appendNextRecordingRef.current
      ? transcriptRef.current.trim()
      : ''
    setTranscript(prefix)
    setCursorOffset(prefix.length)
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const audio = await recording.stop()
      let result = ''
      for await (const delta of createMiMoVoiceProvider(
        config,
      ).transcribeStream(audio, controller.signal)) {
        if (controller.signal.aborted || closedRef.current) return
        result += delta
        const combined = prefix ? `${prefix}\n${result}` : result
        transcriptRef.current = combined
        setTranscript(combined)
        setCursorOffset(combined.length)
      }
      if (closedRef.current || controller.signal.aborted) return
      const combined = prefix ? `${prefix}\n${result}` : result
      transcriptRef.current = combined
      appendNextRecordingRef.current = false
      setTranscript(combined)
      setCursorOffset(combined.length)
      setState({ kind: 'review' })
    } catch (error) {
      if (!closedRef.current && !controller.signal.aborted) {
        setState({ kind: 'error', message: toSafeMessage(error) })
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }, [])

  const submitTranscript = useCallback(
    async (value: string) => {
      const prompt = value.trim()
      if (!prompt) {
        setState({
          kind: 'error',
          message:
            'The transcript is empty. Record again or edit it before sending.',
        })
        return
      }
      if (!submission) {
        onDone({
          type: 'submit-prompt',
          prompt,
          voiceInput: true,
          voiceResponse: configRef.current?.speakResponses === true,
        })
        return
      }
      setState({ kind: 'submitting' })
      try {
        const result = await submission.submit(prompt)
        if (!closedRef.current) onDone(result)
      } catch (error) {
        if (closedRef.current) return
        setState({
          kind: 'review',
          error:
            error instanceof VoiceSubmissionError
              ? error.message
              : `Could not send the reviewed transcript to ${submission.destination}.`,
        })
      }
    },
    [onDone, submission],
  )

  useKeypress(
    (input, key) => {
      if (key.escape || (key.ctrl && input === 'c')) {
        if (state.kind === 'transcribing') {
          requestRef.current?.abort()
          setState({ kind: 'ready' })
          return true
        }
        close()
        return true
      }
      if (state.kind === 'review' && key.ctrl && input === 'r') {
        void startRecording(true)
        return true
      }
      if (!key.return) return undefined
      if (state.kind === 'ready' || state.kind === 'error') {
        void startRecording()
        return true
      }
      if (state.kind === 'recording') {
        void stopRecording()
        return true
      }
      return undefined
    },
    { priority: KEYPRESS_PRIORITY.FULLSCREEN_OVERLAY },
  )

  const stateLine =
    state.kind === 'ready'
      ? 'Press Enter to begin recording.'
      : state.kind === 'preparing'
        ? 'Preparing the macOS microphone recorder…'
        : state.kind === 'recording'
          ? `Recording. Press Enter to stop (maximum ${configRef.current?.maxRecordingSeconds ?? '?'} seconds).`
          : state.kind === 'transcribing'
            ? 'Transcribing securely with MiMo…'
            : state.kind === 'review'
              ? `Review the transcript, then press Enter to send it to ${submission?.destination ?? 'the normal agent'}.`
              : state.kind === 'submitting'
                ? `Sending reviewed transcript to ${submission?.destination ?? 'the normal agent'}…`
                : 'Press Enter to try again, or Esc to close.'

  return (
    <ScreenFrame
      title="Voice conversation"
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="column" gap={layout.gap}>
        <Text dimColor wrap="truncate-end">
          {stateLine}
        </Text>
        {state.kind === 'recording' ? (
          <Text color={theme.warning} bold>
            ● Listening
          </Text>
        ) : null}
        {state.kind === 'review' ? (
          <Box flexDirection="column">
            <Text dimColor>Transcript:</Text>
            <TextInput
              value={transcript}
              onChange={value => {
                transcriptRef.current = value
                setTranscript(value)
                setCursorOffset(value.length)
              }}
              onSubmit={submitTranscript}
              columns={Math.max(1, columns - layout.paddingX * 2 - 2)}
              cursorOffset={cursorOffset}
              onChangeCursorOffset={setCursorOffset}
              multiline={true}
              focus={true}
            />
          </Box>
        ) : null}
        {state.kind === 'transcribing' && transcript ? (
          <Box flexDirection="column">
            <Text dimColor>Live transcript:</Text>
            <Text wrap="wrap">{transcript}</Text>
          </Box>
        ) : null}
        {state.kind === 'error' ? (
          <Text color={theme.error}>{state.message}</Text>
        ) : null}
        {state.kind === 'review' && state.error ? (
          <Text color={theme.error}>{state.error}</Text>
        ) : null}
        <Text dimColor wrap="truncate-end">
          {state.kind === 'review'
            ? 'Ctrl+R records another segment and appends it · Esc/Ctrl+C close'
            : 'Esc/Ctrl+C close · /voice config opens settings · /voice stop interrupts speech'}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
