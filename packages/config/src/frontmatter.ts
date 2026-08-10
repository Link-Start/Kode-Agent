import { JSON_SCHEMA, load } from 'js-yaml'

export const MAX_FRONTMATTER_BYTES = 1_000_000

export type ParsedMarkdownFrontmatter = {
  frontmatter: Record<string, unknown>
  content: string
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/**
 * Parses the YAML header used by commands, agents, skills, and output styles.
 * Delimiters must occupy their own line so body text cannot close the header
 * accidentally. The byte limit bounds synchronous YAML work on local/plugin
 * files before they reach js-yaml.
 */
export function parseMarkdownFrontmatter(
  input: string,
): ParsedMarkdownFrontmatter {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const opening = /^---[\t ]*\r?\n/u.exec(source)
  if (!opening) return { frontmatter: {}, content: source }

  const closingPattern = /^---[\t ]*(?:\r?\n|$)/gmu
  closingPattern.lastIndex = opening[0].length
  const closing = closingPattern.exec(source)
  if (!closing) throw new Error('Markdown frontmatter is not terminated')

  const yaml = source.slice(opening[0].length, closing.index)
  if (Buffer.byteLength(yaml, 'utf8') > MAX_FRONTMATTER_BYTES) {
    throw new Error(
      `Markdown frontmatter exceeds ${MAX_FRONTMATTER_BYTES} bytes`,
    )
  }

  const loaded = yaml.trim() ? load(yaml, { schema: JSON_SCHEMA }) : {}
  return {
    frontmatter: asRecord(loaded),
    content: source.slice(closing.index + closing[0].length),
  }
}
