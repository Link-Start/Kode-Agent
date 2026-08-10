import React from 'react'

import { HttpClient } from '@kode/client'
import type { KodeClient, RuntimeStatus } from '@kode/client'

const RUNTIME_STATUS_POLL_MS = 5_000

export function useRuntimeClient(args: {
  baseUrl: string
  token: string
  workspaceId: string | null
}): {
  client: KodeClient | null
  runtimeAttached: boolean
  runtimeStatus: RuntimeStatus | null
  restartClient: () => void
} {
  const [clientGeneration, setClientGeneration] = React.useState(0)
  const restartClient = React.useCallback(
    () => setClientGeneration(generation => generation + 1),
    [],
  )

  const client = React.useMemo(() => {
    // The generation is intentionally part of this factory so callers can
    // discard a live transport and reconnect without changing credentials.
    void clientGeneration
    if (!args.token) return null
    return new HttpClient({
      baseUrl: args.baseUrl,
      token: args.token,
      workspaceId: args.workspaceId ?? undefined,
    })
  }, [args.baseUrl, args.token, args.workspaceId, clientGeneration])

  const [runtimeAttached, setRuntimeAttached] = React.useState(false)
  const [runtimeStatus, setRuntimeStatus] =
    React.useState<RuntimeStatus | null>(null)

  React.useEffect(() => {
    if (!client) {
      setRuntimeAttached(false)
      return undefined
    }

    setRuntimeAttached(client.isConnected())
    const unsubscribe = client.onConnectionChange(setRuntimeAttached)
    return () => {
      unsubscribe()
      client.disconnect()
    }
  }, [client])

  React.useEffect(() => {
    if (!client) {
      setRuntimeStatus(null)
      return undefined
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      let nextStatus: RuntimeStatus
      try {
        nextStatus = await client.getRuntimeStatus()
      } catch {
        nextStatus = {
          ok: false,
          transport: 'daemon',
          pid: null,
          version: null,
          activeSessions: null,
        }
      }

      if (cancelled) return
      setRuntimeStatus(nextStatus)
      timer = setTimeout(() => void poll(), RUNTIME_STATUS_POLL_MS)
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [client])

  return { client, runtimeAttached, runtimeStatus, restartClient }
}
