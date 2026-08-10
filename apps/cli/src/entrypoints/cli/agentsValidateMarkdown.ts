import { readFileSync } from 'node:fs'
import { parseMarkdownFrontmatter } from '#config/frontmatter'

export function readMarkdownFile(
  filePath: string,
):
  | { frontmatter: Record<string, unknown>; content: string }
  | { error: string } {
  try {
    const raw = readFileSync(filePath, 'utf8')
    return parseMarkdownFrontmatter(raw)
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
