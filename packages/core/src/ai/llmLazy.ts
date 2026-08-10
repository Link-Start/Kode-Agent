import type {
  queryLLM as queryLLMImpl,
  queryQuick as queryQuickImpl,
} from '#core/ai/llm'
import { setPromptHookQueryProvider } from '@kode/hooks/promptQuery'

type QueryLLM = typeof queryLLMImpl
type QueryQuick = typeof queryQuickImpl
type LlmModule = typeof import('#core/ai/llm')

type QueryLLMLoader = () => Promise<QueryLLM>
type QueryQuickLoader = () => Promise<QueryQuick>
type LlmModuleLoader = () => Promise<LlmModule>

const defaultLlmModuleLoader: LlmModuleLoader = () => import('#core/ai/llm')

let llmModuleLoader = defaultLlmModuleLoader
let llmModulePromise: Promise<LlmModule> | null = null
let prewarmPromise: Promise<void> | null = null

function clearPromiseOnFailure<T>(
  promise: Promise<T>,
  clear: () => void,
): Promise<T> {
  void promise.catch(clear)
  return promise
}

function loadLlmModule(): Promise<LlmModule> {
  if (llmModulePromise) return llmModulePromise

  const pending = Promise.resolve().then(llmModuleLoader)
  llmModulePromise = clearPromiseOnFailure(pending, () => {
    if (llmModulePromise === pending) llmModulePromise = null
  })
  return llmModulePromise
}

const defaultQueryLLMLoader: QueryLLMLoader = async () =>
  (await loadLlmModule()).queryLLM

const defaultQueryQuickLoader: QueryQuickLoader = async () =>
  (await loadLlmModule()).queryQuick

let queryLLMLoader = defaultQueryLLMLoader
let queryQuickLoader = defaultQueryQuickLoader
let queryLLMPromise: Promise<QueryLLM> | null = null
let queryQuickPromise: Promise<QueryQuick> | null = null

function loadQueryLLM(): Promise<QueryLLM> {
  if (queryLLMPromise) return queryLLMPromise

  const pending = Promise.resolve().then(queryLLMLoader)
  queryLLMPromise = clearPromiseOnFailure(pending, () => {
    if (queryLLMPromise === pending) queryLLMPromise = null
  })
  return queryLLMPromise
}

function loadQueryQuick(): Promise<QueryQuick> {
  if (queryQuickPromise) return queryQuickPromise

  const pending = Promise.resolve().then(queryQuickLoader)
  queryQuickPromise = clearPromiseOnFailure(pending, () => {
    if (queryQuickPromise === pending) queryQuickPromise = null
  })
  return queryQuickPromise
}

/**
 * Starts one process-wide, no-network LLM runtime warmup after the TUI mounts.
 * Concurrent callers share the same promise; failed warmups are retryable.
 */
export function prewarmLlmRuntime(): Promise<void> {
  if (prewarmPromise) return prewarmPromise

  const pending = loadLlmModule().then(module => {
    module.prepareLlmRuntime()
  })
  prewarmPromise = clearPromiseOnFailure(pending, () => {
    if (prewarmPromise === pending) prewarmPromise = null
  })
  return prewarmPromise
}

export function __setLlmLazyQueryLLMLoaderForTests(
  loader: QueryLLMLoader | null,
): void {
  queryLLMLoader = loader ?? defaultQueryLLMLoader
  queryLLMPromise = null
}

export function __setLlmLazyQueryQuickLoaderForTests(
  loader: QueryQuickLoader | null,
): void {
  queryQuickLoader = loader ?? defaultQueryQuickLoader
  queryQuickPromise = null
}

export function __setLlmLazyModuleLoaderForTests(
  loader: LlmModuleLoader | null,
): void {
  llmModuleLoader = loader ?? defaultLlmModuleLoader
  llmModulePromise = null
  prewarmPromise = null
  queryLLMPromise = null
  queryQuickPromise = null
}

export function __resetLlmLazyRuntimeForTests(): void {
  llmModuleLoader = defaultLlmModuleLoader
  queryLLMLoader = defaultQueryLLMLoader
  queryQuickLoader = defaultQueryQuickLoader
  llmModulePromise = null
  prewarmPromise = null
  queryLLMPromise = null
  queryQuickPromise = null
}

export async function queryLLM(
  ...args: Parameters<QueryLLM>
): ReturnType<QueryLLM> {
  const inner = await loadQueryLLM()
  return inner(...args)
}

export async function queryQuick(
  ...args: Parameters<QueryQuick>
): ReturnType<QueryQuick> {
  const inner = await loadQueryQuick()
  return inner(...args)
}

export async function verifyApiKey(
  apiKey: string,
  baseURL?: string,
  provider?: string,
): Promise<boolean> {
  const { verifyApiKey: inner } = await import('#core/ai/llm')
  return inner(apiKey, baseURL, provider)
}

export async function fetchAnthropicModels(
  baseURL: string,
  apiKey: string,
): Promise<any[]> {
  const { fetchAnthropicModels: inner } = await import('#core/ai/llm')
  return inner(baseURL, apiKey)
}

setPromptHookQueryProvider(args => queryQuick(args))
