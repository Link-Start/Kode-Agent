import * as React from 'react'
import { Box, Text } from 'ink'
import figures from 'figures'

import { ModelSelector } from '#ui-ink/components/ModelSelector'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { getTheme } from '#core/utils/theme'
import {
  codexAuthService,
  type CodexAuthService,
  type CodexLoginStatus,
  type CodexRecommendedSettings,
} from '#cli-services/codexLogin'

type LoginRoute = 'selection' | 'openai' | 'providers'
type CodexFlowState =
  | 'selection'
  | 'waiting'
  | 'loading-recommendation'
  | 'recommendation'
  | 'applying'
  | 'apply-error'
  | 'complete'
  | 'error'

type LoginOption = {
  id: 'codex' | 'openai' | 'providers'
  label: string
  description: string
}

const LOGIN_OPTIONS: LoginOption[] = [
  {
    id: 'codex',
    label: 'Codex / ChatGPT',
    description: 'Use the installed Codex CLI browser sign-in.',
  },
  {
    id: 'openai',
    label: 'OpenAI API key (GPT-5-Codex)',
    description:
      'Configure an OpenAI model profile that Kode can use directly.',
  },
  {
    id: 'providers',
    label: 'Another model provider',
    description: 'Configure any supported API provider and model profile.',
  },
]

const CODEX_POLL_INTERVAL_MS = 1_500
const CODEX_LOGIN_TIMEOUT_MS = 5 * 60 * 1_000

export type LoginScreenProps = {
  onDone: () => void
  codexAuth?: CodexAuthService
  pollIntervalMs?: number
}

function statusLabel(
  status: CodexLoginStatus | null,
  checking: boolean,
): string {
  if (checking) return 'Checking installed Codex CLI…'
  if (status?.kind === 'authenticated') return 'Codex is already signed in.'
  if (status?.kind === 'unauthenticated') return 'Codex is not signed in yet.'
  return 'Codex CLI is unavailable on this machine.'
}

export function LoginScreen({
  onDone,
  codexAuth = codexAuthService,
  pollIntervalMs = CODEX_POLL_INTERVAL_MS,
}: LoginScreenProps): React.ReactNode {
  const theme = getTheme()
  const exitState = useExitOnCtrlCD(onDone)
  const [route, setRoute] = React.useState<LoginRoute>('selection')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const [codexStatus, setCodexStatus] = React.useState<CodexLoginStatus | null>(
    null,
  )
  const [checkingStatus, setCheckingStatus] = React.useState(true)
  const [codexFlowState, setCodexFlowState] =
    React.useState<CodexFlowState>('selection')
  const [codexError, setCodexError] = React.useState<string | null>(null)
  const [codexRecommendation, setCodexRecommendation] =
    React.useState<CodexRecommendedSettings | null>(null)
  const [useCodexRecommendation, setUseCodexRecommendation] =
    React.useState(true)
  const [codexRecommendationApplied, setCodexRecommendationApplied] =
    React.useState<boolean | null>(null)
  const activeCodexLoginIdRef = React.useRef(0)
  const checkForLoginRef = React.useRef<(() => Promise<void>) | null>(null)

  const refreshCodexStatus = React.useCallback(
    async (canUpdate: () => boolean = () => true) => {
      try {
        const nextStatus = await codexAuth.getStatus()
        if (canUpdate()) setCodexStatus(nextStatus)
        return nextStatus
      } catch {
        const unavailable: CodexLoginStatus = { kind: 'unavailable' }
        if (canUpdate()) setCodexStatus(unavailable)
        return unavailable
      } finally {
        if (canUpdate()) setCheckingStatus(false)
      }
    },
    [codexAuth],
  )

  const loadCodexRecommendation = React.useCallback(
    async (loginId: number) => {
      setCodexFlowState('loading-recommendation')
      try {
        const recommendation = await codexAuth.getRecommendedSettings()
        if (activeCodexLoginIdRef.current !== loginId) return
        setCodexRecommendation(recommendation)
        setUseCodexRecommendation(true)
        setCodexRecommendationApplied(null)
        setCodexFlowState('recommendation')
      } catch {
        if (activeCodexLoginIdRef.current !== loginId) return
        setCodexError(
          'Codex is signed in, but its recommended model settings could not be loaded. No settings were changed.',
        )
        setCodexFlowState('error')
      }
    },
    [codexAuth],
  )

  React.useEffect(() => {
    let cancelled = false
    void refreshCodexStatus(() => !cancelled)
    return () => {
      cancelled = true
    }
  }, [refreshCodexStatus])

  React.useEffect(() => {
    if (codexFlowState !== 'waiting') return undefined

    let cancelled = false
    let checking = false
    const loginId = activeCodexLoginIdRef.current
    const isCurrent = () =>
      !cancelled && activeCodexLoginIdRef.current === loginId
    const checkForLogin = async () => {
      if (checking) return
      checking = true
      const nextStatus = await refreshCodexStatus(isCurrent)
      checking = false
      if (!isCurrent()) return

      if (nextStatus.kind === 'authenticated') {
        await loadCodexRecommendation(loginId)
      } else if (nextStatus.kind === 'unavailable') {
        setCodexError('Codex CLI could not be reached while signing in.')
        setCodexFlowState('error')
      }
    }
    checkForLoginRef.current = checkForLogin

    const interval = setInterval(
      () => void checkForLogin(),
      Math.max(50, pollIntervalMs),
    )
    const timeout = setTimeout(() => {
      if (!isCurrent()) return
      setCodexError('Timed out waiting for Codex sign-in to finish.')
      setCodexFlowState('error')
    }, CODEX_LOGIN_TIMEOUT_MS)

    return () => {
      cancelled = true
      if (checkForLoginRef.current === checkForLogin) {
        checkForLoginRef.current = null
      }
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [
    codexFlowState,
    loadCodexRecommendation,
    pollIntervalMs,
    refreshCodexStatus,
  ])

  const startCodexBrowserLogin = React.useCallback(async () => {
    if (checkingStatus) return

    setCodexError(null)
    setCodexRecommendation(null)
    setCodexRecommendationApplied(null)
    const loginId = activeCodexLoginIdRef.current + 1
    activeCodexLoginIdRef.current = loginId

    if (codexStatus?.kind === 'authenticated') {
      await loadCodexRecommendation(loginId)
      return
    }
    if (codexStatus?.kind === 'unavailable') {
      setCodexError('Install or repair the Codex CLI, then try again.')
      setCodexFlowState('error')
      return
    }

    setCodexFlowState('waiting')
    try {
      await codexAuth.startLogin()
    } catch {
      if (activeCodexLoginIdRef.current !== loginId) return
      setCodexError('Unable to start the Codex browser sign-in.')
      setCodexFlowState('error')
    }
  }, [checkingStatus, codexAuth, codexStatus, loadCodexRecommendation])

  const keepCurrentCodexSettings = React.useCallback(() => {
    setCodexRecommendationApplied(false)
    setCodexFlowState('complete')
  }, [])

  const applyCodexRecommendation = React.useCallback(async () => {
    if (!codexRecommendation) return

    const loginId = activeCodexLoginIdRef.current
    setCodexError(null)
    setCodexFlowState('applying')
    try {
      await codexAuth.applyRecommendedSettings(codexRecommendation)
      if (activeCodexLoginIdRef.current !== loginId) return
      setCodexRecommendationApplied(true)
      setCodexFlowState('complete')
    } catch {
      if (activeCodexLoginIdRef.current !== loginId) return
      setCodexError(
        'Codex is signed in, but the recommended settings update could not be confirmed. The write is atomic; verify the current defaults or retry.',
      )
      setCodexFlowState('apply-error')
    }
  }, [codexAuth, codexRecommendation])

  useKeypress((input, key) => {
    if (route !== 'selection') return undefined

    const inputChar = input.length === 1 ? input.toLowerCase() : ''
    const isUp = key.upArrow || inputChar === 'k'
    const isDown = key.downArrow || inputChar === 'j'

    if (codexFlowState === 'waiting') {
      if (key.escape) {
        activeCodexLoginIdRef.current += 1
        checkForLoginRef.current = null
        setCodexFlowState('selection')
      }
      if (key.return) {
        void checkForLoginRef.current?.()
      }
      return true
    }

    if (codexFlowState === 'loading-recommendation') {
      if (key.escape) {
        activeCodexLoginIdRef.current += 1
        keepCurrentCodexSettings()
      }
      return true
    }

    if (codexFlowState === 'recommendation') {
      if (key.escape) {
        keepCurrentCodexSettings()
        return true
      }
      if (isUp || isDown) {
        setUseCodexRecommendation(current => !current)
        return true
      }
      if (key.return) {
        if (useCodexRecommendation) void applyCodexRecommendation()
        else keepCurrentCodexSettings()
        return true
      }
      return true
    }

    if (codexFlowState === 'applying') return true

    if (codexFlowState === 'apply-error') {
      if (key.return) void applyCodexRecommendation()
      if (key.escape) keepCurrentCodexSettings()
      return true
    }

    if (codexFlowState === 'complete') {
      if (key.return || key.escape) onDone()
      return true
    }

    if (codexFlowState === 'error') {
      if (key.return || key.escape) {
        setCodexError(null)
        if (codexStatus?.kind === 'authenticated') {
          keepCurrentCodexSettings()
        } else {
          setCodexFlowState('selection')
        }
      }
      return true
    }

    if (key.escape) {
      onDone()
      return true
    }
    if (isUp) {
      setSelectedIndex(current =>
        current === 0 ? LOGIN_OPTIONS.length - 1 : current - 1,
      )
      return true
    }
    if (isDown) {
      setSelectedIndex(current => (current + 1) % LOGIN_OPTIONS.length)
      return true
    }
    if (key.return) {
      const option = LOGIN_OPTIONS[selectedIndex]
      if (option?.id === 'codex') {
        void startCodexBrowserLogin()
      } else if (option?.id === 'openai') {
        setRoute('openai')
      } else if (option?.id === 'providers') {
        setRoute('providers')
      }
      return true
    }
    return undefined
  })

  if (route === 'openai') {
    return (
      <ModelSelector
        initialProvider="openai"
        onDone={onDone}
        onCancel={() => setRoute('selection')}
      />
    )
  }

  if (route === 'providers') {
    return (
      <ModelSelector onDone={onDone} onCancel={() => setRoute('selection')} />
    )
  }

  const selectedOption = LOGIN_OPTIONS[selectedIndex]
  return (
    <ScreenFrame title="Sign in" paddingX={2} paddingY={1} gap={1}>
      <Box flexDirection="column" gap={1}>
        <Text bold>Choose how to configure Kode:</Text>

        <Box flexDirection="column">
          {LOGIN_OPTIONS.map((option, index) => {
            const isSelected = index === selectedIndex
            return (
              <Box key={option.id} flexDirection="row">
                <Text color={isSelected ? theme.kode : theme.secondaryText}>
                  {isSelected ? figures.pointer : ' '}
                </Text>
                <Text
                  color={isSelected ? theme.text : theme.secondaryText}
                  bold={isSelected}
                >
                  {' '}
                  {option.label}
                </Text>
              </Box>
            )
          })}
        </Box>

        {codexFlowState === 'selection' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.secondaryText}>
              {selectedOption?.description}
            </Text>
            {selectedOption?.id === 'codex' ? (
              <Text color={theme.secondaryText}>
                {statusLabel(codexStatus, checkingStatus)}
              </Text>
            ) : null}
            <Text dimColor>
              ChatGPT/Codex credentials remain in Codex CLI. Kode never reads or
              copies its credential cache; configure an API-key model profile to
              use OpenAI models directly in Kode.
            </Text>
          </Box>
        ) : null}

        {codexFlowState === 'waiting' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.suggestion}>
              Browser sign-in started. Complete the Codex / ChatGPT login, then
              this screen will continue automatically.
            </Text>
            <Text dimColor>Enter checks again · Esc returns to choices</Text>
          </Box>
        ) : null}

        {codexFlowState === 'loading-recommendation' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.suggestion}>
              Loading Codex's recommended model settings…
            </Text>
            <Text dimColor>Esc keeps the current Codex settings</Text>
          </Box>
        ) : null}

        {codexFlowState === 'recommendation' && codexRecommendation ? (
          <Box flexDirection="column" gap={1}>
            <Text bold>Use Codex's recommended model settings?</Text>
            <Text color={theme.secondaryText}>
              {codexRecommendation.displayName} ({codexRecommendation.model}) ·{' '}
              {codexRecommendation.reasoningEffort} reasoning
            </Text>
            <Box flexDirection="column">
              <Text
                color={
                  useCodexRecommendation ? theme.text : theme.secondaryText
                }
                bold={useCodexRecommendation}
              >
                {useCodexRecommendation ? figures.pointer : ' '} Apply
                recommended settings
              </Text>
              <Text
                color={
                  !useCodexRecommendation ? theme.text : theme.secondaryText
                }
                bold={!useCodexRecommendation}
              >
                {!useCodexRecommendation ? figures.pointer : ' '} Keep current
                settings
              </Text>
            </Box>
            <Text dimColor>
              This updates Codex user defaults only. Kode model profiles and
              OAuth credentials remain untouched.
            </Text>
            <Text dimColor>
              ↑/↓ or j/k choose · Enter confirm · Esc keep current
            </Text>
          </Box>
        ) : null}

        {codexFlowState === 'applying' && codexRecommendation ? (
          <Text color={theme.suggestion}>
            Applying {codexRecommendation.displayName} with{' '}
            {codexRecommendation.reasoningEffort} reasoning…
          </Text>
        ) : null}

        {codexFlowState === 'apply-error' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.error}>{codexError}</Text>
            <Text dimColor>Enter retries · Esc keeps current settings</Text>
          </Box>
        ) : null}

        {codexFlowState === 'complete' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.success}>
              {codexRecommendationApplied && codexRecommendation
                ? `Codex is signed in. ${codexRecommendation.displayName} with ${codexRecommendation.reasoningEffort} reasoning was saved as the Codex user default.`
                : 'Codex is signed in. Existing Codex model settings were kept.'}
            </Text>
            <Text dimColor>
              Press Enter to continue. Codex credentials were not copied into
              Kode.
            </Text>
          </Box>
        ) : null}

        {codexFlowState === 'error' ? (
          <Box flexDirection="column" gap={1}>
            <Text color={theme.error}>{codexError}</Text>
            <Text dimColor>
              {codexStatus?.kind === 'authenticated'
                ? 'Press Enter to continue without changing settings.'
                : 'Press Enter to return to login choices.'}
            </Text>
          </Box>
        ) : null}

        <Text dimColor>
          {exitState.pending
            ? `Press ${exitState.keyName} again to exit`
            : codexFlowState === 'selection'
              ? '↑/↓ or j/k navigate · Enter select · Esc exit'
              : ''}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
