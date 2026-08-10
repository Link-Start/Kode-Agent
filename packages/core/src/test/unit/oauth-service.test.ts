import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { createServer } from 'node:http'

import { OAuthService } from '#core/services/oauth'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function getFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  await new Promise<void>(resolve => server.close(() => resolve()))
  return address.port
}

function testConfig(port: number) {
  return {
    REDIRECT_PORT: port,
    MANUAL_REDIRECT_URL: 'https://console.test/oauth/code/callback',
    SCOPES: ['profile'],
    AUTHORIZE_URL: 'https://auth.test/authorize',
    TOKEN_URL: 'https://auth.test/token',
    API_KEY_URL: 'https://auth.test/api-key',
    SUCCESS_URL: 'https://console.test/success',
    CLIENT_ID: 'kode-test',
  }
}

function jsonResponse(accessToken: string): Response {
  return new Response(JSON.stringify({ access_token: accessToken }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stateFrom(url: string): string {
  const state = new URL(url).searchParams.get('state')
  if (!state) throw new Error('Missing OAuth state')
  return state
}

const services: OAuthService[] = []

afterEach(async () => {
  await Promise.all(
    services.splice(0).map(service => service.cancelOAuthFlow()),
  )
})

describe('OAuthService flow lifecycle', () => {
  test('keeps invalid state pending, accepts a later callback, and uses one IPv4 redirect URI', async () => {
    const port = await getFreePort()
    const manualUrl = deferred<string>()
    const browserUrl = deferred<string>()
    let tokenBody: Record<string, unknown> | undefined
    const service = new OAuthService({
      oauthConfig: testConfig(port),
      openBrowserImpl: async url => {
        browserUrl.resolve(url)
        return true
      },
      fetchImpl: async (_input, init) => {
        tokenBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return jsonResponse('token-auto')
      },
    })
    services.push(service)

    const resultPromise = service.startOAuthFlow(async url => {
      manualUrl.resolve(url)
    })
    const state = stateFrom(await manualUrl.promise)
    const autoUrl = new URL(await browserUrl.promise)
    const redirectUri = `http://127.0.0.1:${port}/callback`
    expect(autoUrl.searchParams.get('redirect_uri')).toBe(redirectUri)

    const invalid = await fetch(
      `${redirectUri}?code=wrong&state=invalid-state`,
      { redirect: 'manual' },
    )
    expect(invalid.status).toBe(400)

    const valid = await fetch(
      `${redirectUri}?code=valid-code&state=${encodeURIComponent(state)}`,
      { redirect: 'manual' },
    )
    expect(valid.status).toBe(302)
    await expect(resultPromise).resolves.toEqual({ accessToken: 'token-auto' })
    expect(tokenBody?.redirect_uri).toBe(redirectUri)
    expect(tokenBody?.state).toBe(state)
  })

  test('reports an occupied IPv4 callback port', async () => {
    const port = await getFreePort()
    const blocker = createServer()
    await new Promise<void>((resolve, reject) => {
      blocker.once('error', reject)
      blocker.listen(port, '127.0.0.1', resolve)
    })
    const service = new OAuthService({
      oauthConfig: testConfig(port),
      openBrowserImpl: async () => true,
      fetchImpl: async () => jsonResponse('unused'),
    })
    services.push(service)
    const errorLog = spyOn(console, 'error').mockImplementation(() => {})

    try {
      await expect(service.startOAuthFlow(async () => {})).rejects.toThrow(
        `Port ${port} is already in use`,
      )
    } finally {
      errorLog.mockRestore()
      await new Promise<void>(resolve => blocker.close(() => resolve()))
    }
  })

  test('a concurrent start supersedes the earlier flow before callback setup', async () => {
    const port = await getFreePort()
    const secondUrl = deferred<string>()
    const service = new OAuthService({
      oauthConfig: testConfig(port),
      openBrowserImpl: async () => true,
      fetchImpl: async () => jsonResponse('token-second'),
    })
    services.push(service)

    const firstError = service
      .startOAuthFlow(async () => {})
      .then(
        () => null,
        error => error as Error,
      )
    const second = service.startOAuthFlow(async url => secondUrl.resolve(url))

    expect((await firstError)?.message).toContain('superseded')
    service.processCallback({
      authorizationCode: 'code-second',
      state: stateFrom(await secondUrl.promise),
      useManualRedirect: true,
    })
    await expect(second).resolves.toEqual({ accessToken: 'token-second' })
  })

  test('superseding during token exchange aborts the old flow without overwriting the new verifier', async () => {
    const port = await getFreePort()
    const firstUrl = deferred<string>()
    const secondUrl = deferred<string>()
    const firstExchangeStarted = deferred<void>()
    const bodies: Record<string, unknown>[] = []
    const service = new OAuthService({
      oauthConfig: testConfig(port),
      openBrowserImpl: async () => true,
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        bodies.push(body)
        if (body.code === 'code-first') {
          firstExchangeStarted.resolve()
          return await new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              reject(new Error('exchange aborted'))
            })
          })
        }
        return jsonResponse('token-second')
      },
    })
    services.push(service)

    const first = service.startOAuthFlow(async url => firstUrl.resolve(url))
    const firstError = first.then(
      () => null,
      error => error as Error,
    )
    service.processCallback({
      authorizationCode: 'code-first',
      state: stateFrom(await firstUrl.promise),
      useManualRedirect: true,
    })
    await firstExchangeStarted.promise

    const second = service.startOAuthFlow(async url => secondUrl.resolve(url))
    service.processCallback({
      authorizationCode: 'code-second',
      state: stateFrom(await secondUrl.promise),
      useManualRedirect: true,
    })

    expect((await firstError)?.message).toContain('superseded')
    await expect(second).resolves.toEqual({ accessToken: 'token-second' })
    expect(bodies).toHaveLength(2)
    expect(bodies[0]?.code_verifier).not.toBe(bodies[1]?.code_verifier)
    expect(bodies[0]?.state).not.toBe(bodies[1]?.state)
  })

  test('cancellation rejects the waiter and releases the callback port for reuse', async () => {
    const port = await getFreePort()
    const firstUrl = deferred<string>()
    const secondUrl = deferred<string>()
    const service = new OAuthService({
      oauthConfig: testConfig(port),
      openBrowserImpl: async () => true,
      fetchImpl: async () => jsonResponse('token-reused'),
    })
    services.push(service)

    const firstError = service
      .startOAuthFlow(async url => firstUrl.resolve(url))
      .then(
        () => null,
        error => error as Error,
      )
    await firstUrl.promise
    await service.cancelOAuthFlow()
    expect((await firstError)?.message).toContain('cancelled')

    const second = service.startOAuthFlow(async url => secondUrl.resolve(url))
    service.processCallback({
      authorizationCode: 'code-reused',
      state: stateFrom(await secondUrl.promise),
      useManualRedirect: true,
    })
    await expect(second).resolves.toEqual({ accessToken: 'token-reused' })
  })
})
