import { existsSync, readdirSync, statSync, type Dirent } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { matchAdvanced } from './advancedFuzzyMatcher'
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
    const lowerNameFilter = nameFilter.toLowerCase()
    const useFuzzy = lowerNameFilter.length >= 2
    const entries = readdirSync(searchDir, { withFileTypes: true })
      .filter(entry => {
        if (!showHidden && entry.name.startsWith('.')) return false
        if (!nameFilter) return true
        const lower = entry.name.toLowerCase()
        if (lower.startsWith(lowerNameFilter)) return true
        // Fuzzy fallback (abbreviations/subsequences) so e.g. "pkg" matches
        // "package.json". Gated on 2+ chars and capped below to avoid noise.
        return useFuzzy && matchAdvanced(entry.name, nameFilter).matched
      })
      .map(entry => {
        const isDir = isDirectoryEntry(entry, searchDir)
        const lower = entry.name.toLowerCase()
        const prefixMatch = lower.startsWith(lowerNameFilter)
        const fuzzyScore = prefixMatch
          ? 0
          : matchAdvanced(entry.name, nameFilter).score
        return {
          entry: entry.name,
          isDir,
          prefixMatch,
          fuzzyScore,
        }
      })
      .sort((a, b) => {
        if (a.isDir && !b.isDir) return -1
        if (!a.isDir && b.isDir) return 1

        if (a.prefixMatch !== b.prefixMatch) {
          return a.prefixMatch ? -1 : 1
        }
        if (a.fuzzyScore !== b.fuzzyScore) {
          return b.fuzzyScore - a.fuzzyScore
        }
        return a.entry.toLowerCase().localeCompare(b.entry.toLowerCase())
      })
      .slice(0, 25)
      .map(({ entry, isDir }) => {
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

    return entries
  } catch {
    return []
  }
}
