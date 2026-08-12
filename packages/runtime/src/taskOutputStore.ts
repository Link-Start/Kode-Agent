import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'fs'
import { dirname, join } from 'path'
import { getKodeRoot } from '#config/dataRoots'
import { LEGACY_ENV } from '#config/compat/legacyEnv'
import { resolveSandboxTmpDir } from './shell/sandboxEnv'

function getKodeBaseDir(): string {
  return getKodeRoot()
}

// Compatibility: project directory is a sanitized cwd string.
function getProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function getProjectRootForTaskOutputs(): string {
  const override = process.env.KODE_PROJECT_DIR
  if (typeof override === 'string' && override.trim()) return override.trim()

  const legacyOverride = process.env[LEGACY_ENV.projectDir]
  if (typeof legacyOverride === 'string' && legacyOverride.trim())
    return legacyOverride.trim()

  return process.cwd()
}

export function getTaskOutputsStoreDir(): string {
  return join(
    getKodeBaseDir(),
    getProjectDir(getProjectRootForTaskOutputs()),
    'tasks',
  )
}

export function getTaskOutputsUserFacingDir(): string {
  const tmpBase = resolveSandboxTmpDir()
  return join(tmpBase, getProjectDir(getProjectRootForTaskOutputs()), 'tasks')
}

export function getTaskOutputStoreFilePath(taskId: string): string {
  return join(getTaskOutputsStoreDir(), `${taskId}.output`)
}

export function getTaskOutputUserFacingFilePath(taskId: string): string {
  return join(getTaskOutputsUserFacingDir(), `${taskId}.output`)
}

export function ensureTaskOutputsDirExists(): void {
  const storeDir = getTaskOutputsStoreDir()
  if (!existsSync(storeDir))
    mkdirSync(storeDir, { recursive: true, mode: 0o700 })
  ensurePrivateMode(storeDir, 0o700)

  const userFacingDir = getTaskOutputsUserFacingDir()
  if (!existsSync(userFacingDir))
    mkdirSync(userFacingDir, { recursive: true, mode: 0o700 })
  ensurePrivateMode(userFacingDir, 0o700)
}

function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink()
  } catch {
    return false
  }
}

function ensurePrivateMode(filePath: string, mode: number): void {
  try {
    chmodSync(filePath, mode)
  } catch {
    // Best-effort on filesystems/platforms without POSIX mode support.
  }
}

function tryEnsureUserFacingSymlink(taskId: string): boolean {
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  const userFacingFilePath = getTaskOutputUserFacingFilePath(taskId)
  try {
    const parent = dirname(userFacingFilePath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 })

    if (existsSync(userFacingFilePath)) {
      return isSymlink(userFacingFilePath)
    }

    // Windows can require the "type" arg, but it's harmless elsewhere.
    symlinkSync(storeFilePath, userFacingFilePath, 'file')
    return true
  } catch {
    return false
  }
}

export function touchTaskOutputFile(taskId: string): string {
  ensureTaskOutputsDirExists()
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  if (!existsSync(storeFilePath)) {
    const parent = dirname(storeFilePath)
    if (!existsSync(parent)) mkdirSync(parent, { recursive: true, mode: 0o700 })
    writeFileSync(storeFilePath, '', { encoding: 'utf8', mode: 0o600 })
  }
  ensurePrivateMode(storeFilePath, 0o600)

  return tryEnsureUserFacingSymlink(taskId)
    ? getTaskOutputUserFacingFilePath(taskId)
    : storeFilePath
}

export function getTaskOutputFilePath(taskId: string): string {
  const storeFilePath = getTaskOutputStoreFilePath(taskId)
  const userFacingFilePath = getTaskOutputUserFacingFilePath(taskId)

  if (existsSync(userFacingFilePath) && isSymlink(userFacingFilePath)) {
    return userFacingFilePath
  }

  if (existsSync(storeFilePath) && tryEnsureUserFacingSymlink(taskId)) {
    return userFacingFilePath
  }

  return storeFilePath
}

export function appendTaskOutput(taskId: string, chunk: string): void {
  try {
    ensureTaskOutputsDirExists()
    const storeFilePath = getTaskOutputStoreFilePath(taskId)
    appendFileSync(storeFilePath, chunk, { encoding: 'utf8', mode: 0o600 })
    ensurePrivateMode(storeFilePath, 0o600)
    tryEnsureUserFacingSymlink(taskId)
  } catch {
    // Best-effort: never crash the session on output persistence failures.
  }
}

export function readTaskOutputDelta(
  taskId: string,
  offset: number,
): {
  content: string
  newOffset: number
} {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return { content: '', newOffset: offset }
    const size = statSync(filePath).size
    const start = Math.max(0, Math.min(size, Math.floor(offset)))
    if (size <= start) return { content: '', newOffset: start }

    const length = size - start
    const fd = openSync(filePath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(length)
      const bytesRead = readSync(fd, buffer, 0, length, start)
      return {
        content: buffer.subarray(0, bytesRead).toString('utf8'),
        newOffset: start + bytesRead,
      }
    } finally {
      closeSync(fd)
    }
  } catch {
    return { content: '', newOffset: offset }
  }
}

export function readTaskOutput(taskId: string): string {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return ''
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

export function readTaskOutputTail(
  taskId: string,
  maxBytes: number,
): { content: string; wasTruncated: boolean } {
  try {
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return { content: '', wasTruncated: false }
    const size = statSync(filePath).size
    if (size <= 0 || maxBytes <= 0) {
      return { content: '', wasTruncated: size > 0 }
    }

    const length = Math.min(size, Math.max(1, Math.floor(maxBytes)))
    const start = size - length
    const fd = openSync(filePath, 'r')
    try {
      const buffer = Buffer.allocUnsafe(length)
      const bytesRead = readSync(fd, buffer, 0, length, start)
      return {
        content: buffer.subarray(0, bytesRead).toString('utf8'),
        wasTruncated: start > 0,
      }
    } finally {
      closeSync(fd)
    }
  } catch {
    return { content: '', wasTruncated: false }
  }
}

export function readTaskOutputTailLines(
  taskId: string,
  maxLines: number,
): string[] {
  try {
    const lineLimit = Math.max(0, Math.floor(maxLines))
    if (lineLimit === 0) return []
    const filePath = getTaskOutputStoreFilePath(taskId)
    if (!existsSync(filePath)) return []

    const size = statSync(filePath).size
    if (size <= 0) return []

    const MAX_BYTES = 64 * 1024
    const start = Math.max(0, size - MAX_BYTES)
    const length = size - start
    if (length <= 0) return []

    const fd = openSync(filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      readSync(fd, buf, 0, length, start)
      let text = buf.toString('utf8')
      if (start > 0) {
        const firstNewline = text.indexOf('\n')
        if (firstNewline >= 0) text = text.slice(firstNewline + 1)
        else {
          // A bounded tail of a very large single line is still useful. Keep
          // it visibly marked as partial instead of making /tasks claim that
          // the task produced no output at all.
          const PARTIAL_LINE_BYTES = 4 * 1024
          const partial = buf
            .subarray(Math.max(0, buf.length - PARTIAL_LINE_BYTES))
            .toString('utf8')
            .replace(/^\uFFFD+/u, '')
          text = `[Earlier output omitted; showing partial final line]\n${partial}`
        }
      }
      if (!text) return []

      const lines = text.replace(/\r\n/g, '\n').split('\n')
      return lines.slice(-lineLimit)
    } finally {
      closeSync(fd)
    }
  } catch {
    return []
  }
}
