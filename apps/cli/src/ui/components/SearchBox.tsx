import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'

export function SearchBox({
  query,
  placeholder = 'Search…',
  isFocused,
  isTerminalFocused = true,
  prefix = '⌕',
  width,
}: {
  query: string
  placeholder?: string
  isFocused: boolean
  isTerminalFocused?: boolean
  prefix?: string
  width?: number
}): React.ReactNode {
  const theme = getTheme()
  const safePlaceholder = placeholder.length > 0 ? placeholder : ' '

  return (
    <Box
      flexShrink={0}
      borderStyle="round"
      borderColor={isFocused ? theme.suggestion : theme.secondaryBorder}
      paddingX={1}
      width={width ?? '100%'}
    >
      <Text
        color={isFocused ? theme.text : theme.secondaryText}
        wrap="truncate-end"
      >
        {prefix}{' '}
        {isFocused ? (
          query ? (
            <>
              <Text>{query}</Text>
              {isTerminalFocused ? <Text>█</Text> : null}
            </>
          ) : isTerminalFocused ? (
            <>
              <Text inverse>{safePlaceholder.charAt(0)}</Text>
              <Text color={theme.secondaryText}>
                {safePlaceholder.slice(1)}
              </Text>
            </>
          ) : (
            <Text color={theme.secondaryText}>{safePlaceholder}</Text>
          )
        ) : query ? (
          <Text>{query}</Text>
        ) : (
          <Text>{safePlaceholder}</Text>
        )}
      </Text>
    </Box>
  )
}
