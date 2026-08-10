import { describe, expect, test } from 'bun:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { SettingsPage } from './Settings'

describe('SettingsPage daemon token field', () => {
  test('masks the credential and disables browser text assistance', () => {
    const html = renderToStaticMarkup(
      <SettingsPage
        token="secret-token"
        onTokenChange={() => {}}
        onTokenClear={() => {}}
      />,
    )

    expect(html).toContain(
      '<label class="text-sm font-medium" for="daemon-token"',
    )
    expect(html).toContain('id="daemon-token"')
    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('spellCheck="false"')
  })
})
