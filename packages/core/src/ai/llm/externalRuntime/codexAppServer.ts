import { spawn, type ChildProcess } from 'node:child_process'

const INITIALIZE_REQUEST_ID = 1
const REQUEST_TIMEOUT_MS = 60_000
const MAX_STDOUT_BYTES = 1024 * 1024

type JsonRpcMessage = {
  id?: number | string
  method?: string
  params?: unknown
  result?: unknown
  error?: { message?: unknown }
}

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageError(message: JsonRpcMessage): Error {
  return new Error(
    typeof message.error?.message === 'string'
      ? message.error.message
      : 'Codex app-server request failed',
  )
}

function getCodexCommand(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex'
}

/**
 * Small, bounded JSON-RPC client for Codex App Server. It sends no credentials:
 * the Codex CLI remains the sole owner of its OAuth session.
 */
export class CodexAppServerClient {
  private child: ChildProcess | null = null
  private buffer = ''
  private stdoutBytes = 0
  private nextRequestId = 2
  private readonly pending = new Map<number, PendingRequest>()
  private initialized = false

  constructor(
    private readonly handlers: {
      onNotification?: (method: string, params: unknown) => void
      onServerRequest?: (
        id: number | string,
        method: string,
        params: unknown,
      ) => void
    } = {},
  ) {}

  async start(): Promise<void> {
    if (this.child) return

    const child = spawn(getCodexCommand(), ['app-server', '--stdio'], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'ignore'],
      windowsHide: true,
    })
    this.child = child

    child.stdout?.setEncoding('utf8')
    child.stdout?.on('data', chunk => this.handleOutput(chunk))
    child.once('error', error => this.failAll(error))
    child.once('close', () => {
      if (this.child === child) this.child = null
      this.failAll(new Error('Codex app-server closed unexpectedly'))
    })

    try {
      const result = await this.requestWithId(
        INITIALIZE_REQUEST_ID,
        'initialize',
        {
          clientInfo: {
            name: 'kode-cli',
            title: 'Kode CLI',
            version: process.env.npm_package_version || 'unknown',
          },
          capabilities: {
            experimentalApi: false,
            requestAttestation: false,
          },
        },
      )
      if (!result) throw new Error('Codex app-server did not initialize')
      this.initialized = true
      this.notify('initialized', {})
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  async request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.initialized)
      throw new Error('Codex app-server is not initialized')
    const id = this.nextRequestId++
    return this.requestWithId(id, method, params)
  }

  notify(method: string, params: Record<string, unknown>): void {
    this.write({ method, params })
  }

  respond(id: number | string, result: Record<string, unknown>): void {
    this.write({ id, result })
  }

  respondError(id: number | string, message: string): void {
    this.write({ id, error: { code: -32601, message } })
  }

  async stop(): Promise<void> {
    const child = this.child
    this.child = null
    this.initialized = false
    if (!child) return
    this.failAll(new Error('Codex app-server was stopped'))
    if (!child.killed) child.kill()
  }

  private requestWithId(
    id: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex app-server timed out while calling ${method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timeout })
      try {
        this.write({ id, method, params })
      } catch (error) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private write(message: Record<string, unknown>): void {
    if (!this.child?.stdin || this.child.stdin.destroyed) {
      throw new Error('Codex app-server input is unavailable')
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private handleOutput(chunk: string): void {
    this.stdoutBytes += Buffer.byteLength(chunk)
    if (this.stdoutBytes > MAX_STDOUT_BYTES) {
      this.failAll(new Error('Codex app-server produced too much output'))
      void this.stop()
      return
    }
    this.buffer += chunk

    for (;;) {
      const newline = this.buffer.indexOf('\n')
      if (newline < 0) return
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (!line) continue

      let message: JsonRpcMessage
      try {
        const parsed: unknown = JSON.parse(line)
        if (!isRecord(parsed)) throw new Error('Invalid JSON-RPC message')
        message = parsed
      } catch {
        this.failAll(new Error('Codex app-server emitted invalid JSON-RPC'))
        void this.stop()
        return
      }

      if (
        message.id !== undefined &&
        (message.result !== undefined || message.error)
      ) {
        const id = typeof message.id === 'number' ? message.id : Number.NaN
        const pending = this.pending.get(id)
        if (!pending) continue
        this.pending.delete(id)
        clearTimeout(pending.timeout)
        if (message.error) pending.reject(messageError(message))
        else pending.resolve(message.result)
        continue
      }

      if (message.id !== undefined && typeof message.method === 'string') {
        this.handlers.onServerRequest?.(
          message.id,
          message.method,
          message.params,
        )
        continue
      }
      if (typeof message.method === 'string') {
        this.handlers.onNotification?.(message.method, message.params)
      }
    }
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.pending.delete(id)
      clearTimeout(pending.timeout)
      pending.reject(error)
    }
  }
}
