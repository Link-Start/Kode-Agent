import { Box, Text } from 'ink'
import React, { useSyncExternalStore } from 'react'
import { Cost } from '#ui-ink/components/Cost'
import { MaxSizedText } from '#ui-ink/components/MaxSizedText'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { CIRCLE } from '#core/constants/figures'
import { getTheme } from '#core/utils/theme'
import type { TranscriptItem } from './useTranscriptItems'
import type { AssistantStreamStore } from './assistantStreamStore'

export const ASSISTANT_STREAM_PREVIEW_CHARS_PER_CELL = 4
const MIN_ASSISTANT_STREAM_PREVIEW_CHARS = 512

export function getBoundedAssistantStreamPreviewText(args: {
  text: string
  maxWidth: number
  maxHeight: number
}): string {
  const maxChars = Math.max(
    MIN_ASSISTANT_STREAM_PREVIEW_CHARS,
    Math.max(1, args.maxWidth) *
      Math.max(1, args.maxHeight) *
      ASSISTANT_STREAM_PREVIEW_CHARS_PER_CELL,
  )
  if (args.text.length <= maxChars) return args.text

  let start = args.text.length - maxChars
  const codeUnit = args.text.charCodeAt(start)
  if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) start += 1
  return `…${args.text.slice(start)}`
}

export function AssistantStreamPreview({
  store,
  transientItems,
  maxHeight,
  isVisible,
  debug,
}: {
  store: AssistantStreamStore
  transientItems: TranscriptItem[]
  maxHeight: number
  isVisible: boolean
  debug: boolean
}) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
  const hasLiveText = snapshot.text.trim().length > 0

  if (
    !isVisible ||
    maxHeight <= 0 ||
    (transientItems.length === 0 && !hasLiveText)
  ) {
    return null
  }

  return (
    <Box
      flexDirection="column"
      height={maxHeight}
      justifyContent="flex-end"
      overflow="hidden"
      width="100%"
    >
      {transientItems.map(item => item.jsx)}
      {hasLiveText && (
        <AssistantStreamText
          text={snapshot.text}
          debug={debug}
          addMargin={transientItems.length > 0}
          maxHeight={maxHeight}
        />
      )}
    </Box>
  )
}

/**
 * A stream is updated in-place many times before it becomes a completed
 * transcript message. Parsing the whole accumulated value as Markdown for
 * every frame causes incomplete syntax (especially code fences and emphasis)
 * to restyle earlier rows, which makes terminals visibly redraw/flicker.
 *
 * Keep the preview deliberately plain and bounded. The completed message is
 * still rendered by AssistantTextMessage, so finalized transcript output
 * keeps the normal Markdown rendering.
 */
const AssistantStreamText = React.memo(function AssistantStreamText({
  text,
  debug,
  addMargin,
  maxHeight,
}: {
  text: string
  debug: boolean
  addMargin: boolean
  maxHeight: number
}): React.ReactNode {
  const { columns } = useTerminalSize()
  const contentWidth = Math.max(1, columns - 6)
  const previewText = getBoundedAssistantStreamPreviewText({
    text,
    maxWidth: contentWidth,
    maxHeight,
  })

  return (
    <Box
      alignItems="flex-start"
      flexDirection="row"
      justifyContent="space-between"
      marginTop={addMargin ? 1 : 0}
      width="100%"
    >
      <Box flexDirection="row">
        <Box minWidth={2}>
          <Text color={getTheme().kode}>{CIRCLE}</Text>
        </Box>
        <Box flexDirection="column" width={contentWidth}>
          <MaxSizedText
            text={previewText}
            maxHeight={maxHeight}
            maxWidth={contentWidth}
            overflowDirection="bottom"
          />
        </Box>
      </Box>
      <Cost costUSD={0} durationMs={0} debug={debug} />
    </Box>
  )
})
