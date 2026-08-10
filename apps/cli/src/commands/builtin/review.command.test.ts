import { describe, expect, test } from 'bun:test'
import review from './review'

describe('/review command', () => {
  test('defaults to a read-only working-tree review', async () => {
    const messages = await review.getPromptForCommand('')
    const text = String((messages[0]?.content as any[])?.[0]?.text ?? '')

    expect(text).toContain('<review_scope>working-tree</review_scope>')
    expect(text).toContain('staged and unstaged diffs')
    expect(text).toContain('Do not modify files')
    expect(text).toContain('Report findings first')
    expect(text).toContain('file:line')
  })

  test('preserves a requested PR or path as data and requires safe quoting', async () => {
    const messages = await review.getPromptForCommand('123')
    const text = String((messages[0]?.content as any[])?.[0]?.text ?? '')

    expect(text).toContain('<review_scope>123</review_scope>')
    expect(text).toContain('Quote shell arguments safely')
    expect(text).toContain('pull-request URL')
  })
})
