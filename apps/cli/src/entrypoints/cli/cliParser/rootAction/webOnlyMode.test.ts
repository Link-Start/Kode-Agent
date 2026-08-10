import { afterEach, describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getOrCreateWebToken } from './webOnlyMode'

const originalConfigDir = process.env.KODE_CONFIG_DIR
const temporaryDirectories: string[] = []

afterEach(() => {
  if (originalConfigDir === undefined) delete process.env.KODE_CONFIG_DIR
  else process.env.KODE_CONFIG_DIR = originalConfigDir

  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
})

function createConfigDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'kode-web-token-'))
  temporaryDirectories.push(directory)
  process.env.KODE_CONFIG_DIR = directory
  return directory
}

describe('Web-only daemon token storage', () => {
  test('rotates legacy short tokens and stores the replacement privately', () => {
    const configDir = createConfigDir()
    const tokenFile = join(configDir, 'web-token')
    writeFileSync(tokenFile, 'legacy123', { mode: 0o644 })

    const token = getOrCreateWebToken()

    expect(token).toHaveLength(32)
    expect(token).not.toBe('legacy123')
    expect(readFileSync(tokenFile, 'utf8')).toBe(token)
    if (process.platform !== 'win32') {
      expect(statSync(tokenFile).mode & 0o777).toBe(0o600)
      expect(statSync(configDir).mode & 0o777).toBe(0o700)
    }
  })

  test('reuses an existing strong token and hardens its mode', () => {
    const configDir = createConfigDir()
    const tokenFile = join(configDir, 'web-token')
    const existing = 'a'.repeat(32)
    mkdirSync(configDir, { recursive: true })
    writeFileSync(tokenFile, existing, { mode: 0o644 })

    expect(getOrCreateWebToken()).toBe(existing)
    if (process.platform !== 'win32') {
      expect(statSync(tokenFile).mode & 0o777).toBe(0o600)
    }
  })
})
