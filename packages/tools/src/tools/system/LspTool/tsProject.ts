import { statSync } from 'fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'path'
import { pathToFileURL } from 'url'

type TypeScriptModule = typeof import('typescript')

const cachedTypeScript = new Map<string, TypeScriptModule | null>()

export function tryLoadTypeScriptModule(
  projectCwd: string,
): TypeScriptModule | null {
  const cwd = resolve(projectCwd)
  if (cachedTypeScript.has(cwd)) return cachedTypeScript.get(cwd) ?? null

  try {
    const requireFromCwd = createRequire(
      pathToFileURL(join(cwd, '__kode_lsp__.js')),
    )
    const mod = requireFromCwd('typescript') as TypeScriptModule
    cachedTypeScript.set(cwd, mod)
    return mod
  } catch {
    cachedTypeScript.set(cwd, null)
    return null
  }
}

type TsProjectState = {
  ts: TypeScriptModule
  cwd: string
  rootFiles: Set<string>
  compilerOptions: any
  languageService: any
  versions: Map<string, string>
}

const MAX_CACHED_PROJECTS = 16
const projectCache = new Map<string, TsProjectState>()

function cacheProject(key: string, project: TsProjectState): void {
  if (!projectCache.has(key) && projectCache.size >= MAX_CACHED_PROJECTS) {
    const oldestKey = projectCache.keys().next().value
    if (oldestKey) {
      const oldest = projectCache.get(oldestKey)
      oldest?.languageService.dispose?.()
      projectCache.delete(oldestKey)
    }
  }
  projectCache.set(key, project)
}

export function getOrCreateTsProject(
  projectCwd: string,
  entryFile?: string,
): TsProjectState | null {
  const ts = tryLoadTypeScriptModule(projectCwd)
  if (!ts) return null

  const resolvedEntryFile = entryFile ? resolve(entryFile) : null
  const configPath = ts.findConfigFile(
    resolvedEntryFile ? dirname(resolvedEntryFile) : projectCwd,
    ts.sys.fileExists,
    'tsconfig.json',
  )
  const projectRoot = configPath
    ? dirname(configPath)
    : resolvedEntryFile
      ? dirname(resolvedEntryFile)
      : resolve(projectCwd)
  const cacheKey = configPath
    ? `config:${resolve(configPath)}`
    : `file:${projectRoot}`

  const existing = projectCache.get(cacheKey)
  if (existing) {
    if (resolvedEntryFile) existing.rootFiles.add(resolvedEntryFile)
    projectCache.delete(cacheKey)
    projectCache.set(cacheKey, existing)
    return existing
  }

  let compilerOptions: any = {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  }

  let rootFileNames: string[] = []
  try {
    if (configPath) {
      const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
      if (!configFile.error) {
        const parsed = ts.parseJsonConfigFileContent(
          configFile.config,
          ts.sys,
          projectRoot,
        )
        compilerOptions = { ...compilerOptions, ...parsed.options }
        rootFileNames = parsed.fileNames
      }
    }
  } catch {
    // Best-effort: fall back to single-file mode
  }

  const rootFiles = new Set(rootFileNames)
  if (resolvedEntryFile) rootFiles.add(resolvedEntryFile)
  const versions = new Map<string, string>()

  const host: any = {
    getCompilationSettings: () => compilerOptions,
    getScriptFileNames: () => Array.from(rootFiles),
    getScriptVersion: (fileName: string) => {
      try {
        const stat = statSync(fileName)
        const version = String(stat.mtimeMs ?? Date.now())
        versions.set(fileName, version)
        return version
      } catch {
        return versions.get(fileName) ?? '0'
      }
    },
    getScriptSnapshot: (fileName: string) => {
      try {
        if (!ts.sys.fileExists(fileName)) return undefined
        const content = ts.sys.readFile(fileName)
        if (content === undefined) return undefined
        const stat = statSync(fileName)
        versions.set(fileName, String(stat.mtimeMs ?? Date.now()))
        return ts.ScriptSnapshot.fromString(content)
      } catch {
        return undefined
      }
    },
    getCurrentDirectory: () => projectRoot,
    getDefaultLibFileName: (options: any) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getCanonicalFileName: (fileName: string) =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getNewLine: () => ts.sys.newLine,
  }

  const languageService = ts.createLanguageService(
    host,
    ts.createDocumentRegistry(),
  )

  const state: TsProjectState = {
    ts,
    cwd: projectRoot,
    rootFiles,
    compilerOptions,
    languageService,
    versions,
  }
  cacheProject(cacheKey, state)
  return state
}

export function isFileTypeSupportedByTypescriptBackend(
  filePath: string,
): boolean {
  const ext = extname(filePath).toLowerCase()
  return (
    ext === '.ts' ||
    ext === '.tsx' ||
    ext === '.js' ||
    ext === '.jsx' ||
    ext === '.mts' ||
    ext === '.cts' ||
    ext === '.mjs' ||
    ext === '.cjs'
  )
}
