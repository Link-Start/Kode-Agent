import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  __persistErrorForTests,
  __setErrorsPathForTests,
  getErrorsLog,
} from '#core/logging/log/errors'

describe('error log jsonl parity', () => {
  let tempDir: string
  let errorsPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'kode-errors-jsonl-'))
    errorsPath = join(tempDir, 'errors.jsonl')
    __setErrorsPathForTests(errorsPath, 'ant')
  })

  afterEach(() => {
    __setErrorsPathForTests(null)
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('error persistence appends newline-delimited JSON objects', () => {
    expect(errorsPath.endsWith('.jsonl')).toBe(true)
    expect(existsSync(errorsPath)).toBe(false)

    __persistErrorForTests(new Error('boom'))
    __persistErrorForTests('oops')

    expect(existsSync(errorsPath)).toBe(true)

    const content = readFileSync(errorsPath, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines.length).toBeGreaterThanOrEqual(2)

    for (const line of lines) {
      const parsed = JSON.parse(line) as Record<string, unknown>
      expect(typeof parsed).toBe('object')
      expect(typeof parsed.sessionId).toBe('string')
      expect(typeof parsed.timestamp).toBe('string')
      expect(typeof parsed.cwd).toBe('string')
    }

    const logEntries = getErrorsLog()
    expect(logEntries.length).toBeGreaterThanOrEqual(2)
  })
})
