import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '../lib/utils'

const MARKDOWN_PLUGINS = [remarkGfm]

export default function MarkdownBody(props: { text: string }): React.ReactNode {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      components={{
        pre: ({ children }) => (
          <pre className="my-3 max-h-96 overflow-auto rounded-md border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-bg))] p-3 text-xs leading-relaxed text-[hsl(var(--kode-terminal-text))]">
            {children}
          </pre>
        ),
        code: ({ className, children, ...codeProps }) => (
          <code
            className={cn(
              'rounded bg-[hsl(var(--kode-terminal-elevated))] px-1 py-0.5 font-mono text-[0.92em] text-[hsl(var(--kode-terminal-text))]',
              className,
            )}
            {...codeProps}
          >
            {children}
          </code>
        ),
        table: ({ children }) => (
          <div className="my-3 max-w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-[hsl(var(--kode-terminal-border))] bg-[hsl(var(--kode-terminal-elevated))] px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-[hsl(var(--kode-terminal-border))] px-2 py-1 align-top">
            {children}
          </td>
        ),
      }}
    >
      {props.text}
    </ReactMarkdown>
  )
}
