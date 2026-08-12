import { existsSync, readdirSync, statSync, type Dirent } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import type { UnifiedSuggestion } from './types'

function isDirectoryEntry(entry: Dirent, directory: string): boolean {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false

  try {
    return statSync(join(directory, entry.name)).isDirectory()
  } catch {
    // A broken or unreadable symbolic link should not hide the other entries.
    return false
  }
}

export function generateFileSuggestions(args: {
  prefix: string
  cwd: string
}): UnifiedSuggestion[] {
  const { prefix, cwd } = args

  try {
    const userPath = prefix || '.'
    const isAbsolutePath = userPath.startsWith('/')
    const isHomePath = userPath.startsWith('~')

    let searchPath: string
    if (isHomePath) {
      searchPath = userPath.replace('~', process.env.HOME || '')
    } else if (isAbsolutePath) {
      searchPath = userPath
    } else {
      searchPath = resolve(cwd, userPath)
    }

    const endsWithSlash = userPath.endsWith('/')
    const searchStat = existsSync(searchPath) ? statSync(searchPath) : null

    let searchDir: string
    let nameFilter: string

    if (endsWithSlash || searchStat?.isDirectory()) {
      searchDir = searchPath
      nameFilter = ''
    } else {
      searchDir = dirname(searchPath)
      nameFilter = basename(searchPath)
    }

    if (!existsSync(searchDir)) return []

    const showHidden = nameFilter.startsWith('.') || userPath.includes('/.')
    const entries = readdirSync(searchDir, { withFileTypes: true })
      .filter(entry => {
        if (!showHidden && entry.name.startsWith('.')) return false
        if (
          nameFilter &&
          !entry.name.toLowerCase().startsWith(nameFilter.toLowerCase())
        )
          return false
        return true
      })
      .map(entry => {
        return {
          entry: entry.name,
          isDir: isDirectoryEntry(entry, searchDir),
        }
      })
      .sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1

        return a.entry.toLowerCase().localeCompare(b.entry.toLowerCase())
      })
      .slice(0, 25)

    return entries.map(({ entry, isDir }) => {
      const icon = isDir ? '📁' : '📄'

      let value: string

      if (userPath.includes('/')) {
        if (endsWithSlash) {
          value = userPath + entry + (isDir ? '/' : '')
        } else if (searchStat?.isDirectory()) {
          value = userPath + '/' + entry + (isDir ? '/' : '')
        } else {
          const userDir = userPath.includes('/')
            ? userPath.substring(0, userPath.lastIndexOf('/'))
            : ''
          value = userDir
            ? userDir + '/' + entry + (isDir ? '/' : '')
            : entry + (isDir ? '/' : '')
        }
      } else {
        if (searchStat?.isDirectory()) {
          value = userPath + '/' + entry + (isDir ? '/' : '')
        } else {
          value = entry + (isDir ? '/' : '')
        }
      }

      return {
        value,
        displayValue: `${icon} ${entry}${isDir ? '/' : ''}`,
        type: 'file' as const,
        score: isDir ? 80 : 70,
      }
    })
  } catch {
    return []
  }
}
