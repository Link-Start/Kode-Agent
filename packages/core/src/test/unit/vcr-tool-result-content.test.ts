import { describe, expect, test } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import { __mapVCRMessagesForTests } from '#core/services/vcr'

describe('VCR tool-result fixture mapping', () => {
  test('preserves document and search-result content blocks', () => {
    const content = [
      {
        type: 'tool_result',
        tool_use_id: 'toolu_fixture',
        content: [
          {
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: 'fixture document',
            },
            title: 'Fixture document',
          },
          {
            type: 'search_result',
            source: 'fixture-search',
            title: 'Fixture search result',
            content: [{ type: 'text', text: 'fixture result' }],
          },
          { type: 'tool_reference', tool_name: 'fixture-tool' },
        ],
      },
    ] satisfies ContentBlockParam[]

    const mapped = __mapVCRMessagesForTests([content], value => value)
    const mappedContent = mapped[0]

    expect(mappedContent).toEqual(content)
  })
})
