import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  __resetProjectScopeCacheForTests,
  getProjectScope,
} from '#core/projectScope'

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

describe('project folder scopes', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'kode-project-scope-'))
    git(root, 'init')
    git(root, 'config', 'user.email', 'scope@example.com')
    git(root, 'config', 'user.name', 'Scope Test')
    writeFileSync(join(root, 'README.md'), 'scope\n')
    mkdirSync(join(root, 'packages', 'core'), { recursive: true })
    git(root, 'add', '.')
    git(root, 'commit', '-m', 'initial')
  })

  afterEach(() => {
    __resetProjectScopeCacheForTests()
    rmSync(root, { recursive: true, force: true })
  })

  test('uses the real Git worktree root for every nested project folder', () => {
    const fromRoot = getProjectScope(root)
    const fromNested = getProjectScope(join(root, 'packages', 'core'))

    expect(fromRoot.kind).toBe('git')
    expect(fromNested.rootPath).toBe(fromRoot.rootPath)
    expect(fromNested.id).toBe(fromRoot.id)
  })

  test('does not share context between different project folders', () => {
    const other = mkdtempSync(join(tmpdir(), 'kode-project-scope-other-'))
    try {
      expect(getProjectScope(other).id).not.toBe(getProjectScope(root).id)
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})
