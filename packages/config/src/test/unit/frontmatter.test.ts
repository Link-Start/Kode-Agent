import { describe, expect, test } from 'bun:test'

import {
  MAX_FRONTMATTER_BYTES,
  parseMarkdownFrontmatter,
} from '../../frontmatter'

describe('markdown frontmatter parser', () => {
  test('parses YAML records and preserves the markdown body', () => {
    const parsed = parseMarkdownFrontmatter(
      [
        '---',
        'name: test-command',
        'allowed-tools:',
        '  - Read',
        '  - Grep',
        '---',
        '# Body',
      ].join('\n'),
    )

    expect(parsed.frontmatter).toEqual({
      name: 'test-command',
      'allowed-tools': ['Read', 'Grep'],
    })
    expect(parsed.content).toBe('# Body')
  })

  test('returns plain markdown unchanged apart from an optional BOM', () => {
    expect(parseMarkdownFrontmatter('\uFEFF# Body')).toEqual({
      frontmatter: {},
      content: '# Body',
    })
  })

  test('requires a standalone closing delimiter', () => {
    expect(() => parseMarkdownFrontmatter('---\nname: test\n---body')).toThrow(
      'not terminated',
    )
  })

  test('rejects oversized YAML before parsing it', () => {
    const oversized = `---\nvalue: ${'x'.repeat(MAX_FRONTMATTER_BYTES)}\n---\n`

    expect(() => parseMarkdownFrontmatter(oversized)).toThrow('exceeds')
  })
})
