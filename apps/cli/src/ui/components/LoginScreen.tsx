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
} from '#cli-services/codexLogin'
import { copilotAuthService } from '#cli-services/copilotLogin'
import { grokAuthService } from '#cli-services/grokLogin'
import { ExternalOAuthLoginScreen } from './ExternalOAuthLoginScreen'

type LoginRoute =
  'selection' | 'openai' | 'providers' | 'codex' | 'copilot' | 'grok'

type LoginOption = {
  id: 'codex' | 'copilot' | 'grok' | 'openai' | 'providers'
  label: string
  description: string
}

const LOGIN_OPTIONS: LoginOption[] = [
  {
    id: 'codex',
    label: 'Codex / ChatGPT (OAuth)',
    description:
      'Reuse the installed Codex CLI browser sign-in and choose a Kode model.',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot (OAuth)',
    description:
      'Use the official GitHub Copilot browser or device OAuth flow.',
  },
  {
    id: 'grok',
    label: 'Grok Build (OAuth)',
    description:
      'Use the official Grok OAuth flow and the Grok Build ACP runtime.',
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

export type LoginScreenProps = {
  onDone: () => void
  codexAuth?: CodexAuthService
  pollIntervalMs?: number
}

export function LoginScreen({
  onDone,
  codexAuth = codexAuthService,
  pollIntervalMs,
}: LoginScreenProps): React.ReactNode {
  const theme = getTheme()
  const exitState = useExitOnCtrlCD(onDone)
  const [route, setRoute] = React.useState<LoginRoute>('selection')
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  useKeypress((input, key) => {
    if (route !== 'selection') return undefined

    const inputChar = input.length === 1 ? input.toLowerCase() : ''
    const isUp = key.upArrow || inputChar === 'k'
    const isDown = key.downArrow || inputChar === 'j'

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
        setRoute('codex')
      } else if (option?.id === 'copilot') {
        setRoute('copilot')
      } else if (option?.id === 'grok') {
        setRoute('grok')
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

  if (route === 'codex') {
    return (
      <ExternalOAuthLoginScreen
        provider="codex-oauth"
        title="Codex / ChatGPT OAuth"
        authService={codexAuth}
        onDone={onDone}
        onCancel={() => setRoute('selection')}
        pollIntervalMs={pollIntervalMs}
      />
    )
  }

  if (route === 'copilot') {
    return (
      <ExternalOAuthLoginScreen
        provider="github-copilot"
        title="GitHub Copilot OAuth"
        authService={copilotAuthService}
        onDone={onDone}
        onCancel={() => setRoute('selection')}
        pollIntervalMs={pollIntervalMs}
      />
    )
  }

  if (route === 'grok') {
    return (
      <ExternalOAuthLoginScreen
        provider="grok-build"
        title="Grok Build OAuth"
        authService={grokAuthService}
        onDone={onDone}
        onCancel={() => setRoute('selection')}
        pollIntervalMs={pollIntervalMs}
      />
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

        <Box flexDirection="column" gap={1}>
          <Text color={theme.secondaryText}>{selectedOption?.description}</Text>
          <Text dimColor>
            OAuth credentials remain in their official runtime. Kode persists
            only the selected model profile and model pointers.
          </Text>
        </Box>

        <Text dimColor>
          {exitState.pending
            ? `Press ${exitState.keyName} again to exit`
            : '↑/↓ or j/k navigate · Enter select · Esc exit'}
        </Text>
      </Box>
    </ScreenFrame>
  )
}
