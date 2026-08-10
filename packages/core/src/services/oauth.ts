import * as crypto from 'crypto'
import * as http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'

import { OAUTH_CONFIG } from '#core/constants/oauth'
import { openBrowser } from '#core/utils/browser'
import { logError } from '#core/utils/log'
import {
  AccountInfo,
  getGlobalConfig,
  saveGlobalConfig,
  normalizeApiKeyForConfig,
} from '#core/utils/config'

// Base64URL encoding function (RFC 4648)
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32))
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64URLEncode(Buffer.from(digest))
}

type OAuthTokenExchangeResponse = {
  access_token: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
    name: string
  }
}

export type OAuthResult = {
  accessToken: string
}

type OAuthRuntimeConfig = {
  readonly REDIRECT_PORT: number
  readonly MANUAL_REDIRECT_URL: string
  readonly SCOPES: readonly string[]
  readonly AUTHORIZE_URL: string
  readonly TOKEN_URL: string
  readonly API_KEY_URL: string
  readonly SUCCESS_URL: string
  readonly CLIENT_ID: string
}

type OAuthServiceOptions = {
  oauthConfig?: OAuthRuntimeConfig
  fetchImpl?: OAuthFetch
  openBrowserImpl?: typeof openBrowser
}

type OAuthFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

type AuthorizationResult = {
  authorizationCode: string
  useManualRedirect: boolean
}

type PendingAuthorization = {
  resolve: (result: AuthorizationResult) => void
  reject: (error: Error) => void
}

type OAuthFlow = {
  codeVerifier: string
  state: string
  redirectUri: string
  abortController: AbortController
  server: http.Server | null
  serverClosePromise: Promise<void> | null
  pendingAuthorization: PendingAuthorization | null
  cancellationError: Error | null
}

const LOOPBACK_HOST = '127.0.0.1'

function statesMatch(expected: string, returned: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const returnedBuffer = Buffer.from(returned)
  return (
    expectedBuffer.length === returnedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, returnedBuffer)
  )
}

export class OAuthService {
  private activeFlow: OAuthFlow | null = null
  private readonly oauthConfig: OAuthRuntimeConfig
  private readonly fetchImpl: OAuthFetch
  private readonly openBrowserImpl: typeof openBrowser

  constructor(options: OAuthServiceOptions = {}) {
    this.oauthConfig = options.oauthConfig ?? OAUTH_CONFIG
    this.fetchImpl = options.fetchImpl ?? fetch
    this.openBrowserImpl = options.openBrowserImpl ?? openBrowser
  }

  private createFlow(): OAuthFlow {
    return {
      codeVerifier: generateCodeVerifier(),
      state: base64URLEncode(crypto.randomBytes(32)),
      redirectUri: `http://${LOOPBACK_HOST}:${this.oauthConfig.REDIRECT_PORT}/callback`,
      abortController: new AbortController(),
      server: null,
      serverClosePromise: null,
      pendingAuthorization: null,
      cancellationError: null,
    }
  }

  private generateAuthUrls(
    codeChallenge: string,
    flow: OAuthFlow,
  ): { autoUrl: string; manualUrl: string } {
    const makeUrl = (isManual: boolean): string => {
      const authUrl = new URL(this.oauthConfig.AUTHORIZE_URL)
      authUrl.searchParams.append('client_id', this.oauthConfig.CLIENT_ID)
      authUrl.searchParams.append('response_type', 'code')
      authUrl.searchParams.append(
        'redirect_uri',
        isManual ? this.oauthConfig.MANUAL_REDIRECT_URL : flow.redirectUri,
      )
      authUrl.searchParams.append('scope', this.oauthConfig.SCOPES.join(' '))
      authUrl.searchParams.append('code_challenge', codeChallenge)
      authUrl.searchParams.append('code_challenge_method', 'S256')
      authUrl.searchParams.append('state', flow.state)
      return authUrl.toString()
    }

    return {
      autoUrl: makeUrl(false),
      manualUrl: makeUrl(true),
    }
  }

  async startOAuthFlow(
    authURLHandler: (url: string) => Promise<void>,
  ): Promise<OAuthResult> {
    const previousFlow = this.activeFlow
    const flow = this.createFlow()
    this.activeFlow = flow

    try {
      if (previousFlow) {
        await this.cancelFlow(
          previousFlow,
          new Error('OAuth flow superseded by a new request'),
        )
      }
      this.assertActiveFlow(flow)

      const codeChallenge = await generateCodeChallenge(flow.codeVerifier)
      this.assertActiveFlow(flow)
      const { autoUrl, manualUrl } = this.generateAuthUrls(codeChallenge, flow)

      const callbackResult = await new Promise<AuthorizationResult>(
        (resolve, reject) => {
          flow.pendingAuthorization = { resolve, reject }
          this.startLocalServer(flow, async () => {
            await authURLHandler(manualUrl)
            this.assertActiveFlow(flow)
            if (flow.pendingAuthorization) {
              await this.openBrowserImpl(autoUrl)
            }
          })
        },
      )
      this.assertActiveFlow(flow)

      const tokenResponse = await this.exchangeCodeForTokens(
        flow,
        callbackResult.authorizationCode,
        callbackResult.useManualRedirect,
      )
      this.assertActiveFlow(flow)
      const { access_token: accessToken, account, organization } = tokenResponse

      if (account) {
        const accountInfo: AccountInfo = {
          accountUuid: account.uuid,
          emailAddress: account.email_address,
          organizationUuid: organization?.uuid,
        }
        const config = getGlobalConfig()
        config.oauthAccount = accountInfo
        saveGlobalConfig(config)
      }

      return { accessToken }
    } catch (error) {
      if (flow.cancellationError) {
        throw flow.cancellationError
      }
      throw error
    } finally {
      flow.pendingAuthorization = null
      await this.closeFlowServer(flow)
      if (this.activeFlow === flow) {
        this.activeFlow = null
      }
    }
  }

  async cancelOAuthFlow(
    reason = new Error('OAuth flow cancelled'),
  ): Promise<void> {
    const flow = this.activeFlow
    if (!flow) return
    this.activeFlow = null
    await this.cancelFlow(flow, reason)
  }

  private assertActiveFlow(flow: OAuthFlow): void {
    if (flow.cancellationError) throw flow.cancellationError
    if (this.activeFlow !== flow) {
      throw new Error('OAuth flow superseded by a new request')
    }
  }

  private async cancelFlow(flow: OAuthFlow, error: Error): Promise<void> {
    if (!flow.cancellationError) {
      flow.cancellationError = error
    }
    flow.abortController.abort()
    const pending = flow.pendingAuthorization
    flow.pendingAuthorization = null
    pending?.reject(flow.cancellationError)
    await this.closeFlowServer(flow)
  }

  private resolveAuthorization(
    flow: OAuthFlow,
    result: AuthorizationResult,
  ): boolean {
    if (
      this.activeFlow !== flow ||
      flow.cancellationError ||
      !flow.pendingAuthorization
    ) {
      return false
    }
    const pending = flow.pendingAuthorization
    flow.pendingAuthorization = null
    void this.closeFlowServer(flow)
    pending.resolve(result)
    return true
  }

  private startLocalServer(
    flow: OAuthFlow,
    onReady: () => Promise<void>,
  ): void {
    const server = http.createServer(
      (req: IncomingMessage, res: ServerResponse) => {
        let parsedUrl: URL
        try {
          parsedUrl = new URL(req.url || '/', flow.redirectUri)
        } catch {
          res.writeHead(400)
          res.end('Invalid callback URL')
          return
        }

        if (parsedUrl.pathname !== '/callback') {
          res.writeHead(404)
          res.end()
          return
        }
        if (req.method !== 'GET') {
          res.writeHead(405, { Allow: 'GET' })
          res.end()
          return
        }
        if (this.activeFlow !== flow || flow.cancellationError) {
          res.writeHead(410)
          res.end('OAuth flow is no longer active')
          return
        }

        const authorizationCode = parsedUrl.searchParams.get('code')
        const returnedState = parsedUrl.searchParams.get('state')

        if (!authorizationCode) {
          res.writeHead(400)
          res.end('Authorization code not found')
          return
        }
        if (!returnedState || !statesMatch(flow.state, returnedState)) {
          res.writeHead(400)
          res.end('Invalid state parameter')
          return
        }

        if (
          !this.resolveAuthorization(flow, {
            authorizationCode,
            useManualRedirect: false,
          })
        ) {
          res.writeHead(410)
          res.end('OAuth flow is no longer awaiting a callback')
          return
        }

        res.writeHead(302, {
          Location: this.oauthConfig.SUCCESS_URL,
        })
        res.end()
      },
    )
    flow.server = server

    server.once('error', (error: Error) => {
      const portError = error as NodeJS.ErrnoException
      const normalizedError =
        portError.code === 'EADDRINUSE'
          ? new Error(
              `Port ${this.oauthConfig.REDIRECT_PORT} is already in use. Please ensure no other applications are using this port.`,
            )
          : error
      logError(normalizedError)
      void this.cancelFlow(flow, normalizedError)
    })

    server.listen(this.oauthConfig.REDIRECT_PORT, LOOPBACK_HOST, () => {
      if (this.activeFlow !== flow || flow.cancellationError) {
        void this.closeFlowServer(flow)
        return
      }
      void onReady().catch(error => {
        const normalizedError =
          error instanceof Error ? error : new Error(String(error))
        void this.cancelFlow(flow, normalizedError)
      })
    })
  }

  private async exchangeCodeForTokens(
    flow: OAuthFlow,
    authorizationCode: string,
    useManualRedirect: boolean = false,
  ): Promise<OAuthTokenExchangeResponse> {
    const requestBody = {
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: useManualRedirect
        ? this.oauthConfig.MANUAL_REDIRECT_URL
        : flow.redirectUri,
      client_id: this.oauthConfig.CLIENT_ID,
      code_verifier: flow.codeVerifier,
      state: flow.state,
    }

    const response = await this.fetchImpl(this.oauthConfig.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: flow.abortController.signal,
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`)
    }

    const data = (await response.json()) as unknown
    const accessToken =
      data && typeof data === 'object'
        ? (data as Record<string, unknown>).access_token
        : undefined
    if (typeof accessToken !== 'string' || !accessToken.trim()) {
      throw new Error('Token exchange returned an invalid access token')
    }
    return data as OAuthTokenExchangeResponse
  }

  processCallback({
    authorizationCode,
    state,
    useManualRedirect,
  }: {
    authorizationCode: string
    state: string
    useManualRedirect: boolean
  }): void {
    const flow = this.activeFlow
    if (!flow || flow.cancellationError || !flow.pendingAuthorization) {
      throw new Error('OAuth flow is not awaiting an authorization callback')
    }
    if (!statesMatch(flow.state, state)) {
      throw new Error('Invalid state parameter')
    }
    if (!authorizationCode) {
      throw new Error('No authorization code received')
    }
    if (
      !this.resolveAuthorization(flow, {
        authorizationCode,
        useManualRedirect,
      })
    ) {
      throw new Error('OAuth flow is not awaiting an authorization callback')
    }
  }

  private closeFlowServer(flow: OAuthFlow): Promise<void> {
    if (flow.serverClosePromise) return flow.serverClosePromise
    const server = flow.server
    if (!server) return Promise.resolve()
    flow.server = null

    flow.serverClosePromise = new Promise(resolve => {
      try {
        server.close(error => {
          const closeError = error as NodeJS.ErrnoException | undefined
          if (closeError && closeError.code !== 'ERR_SERVER_NOT_RUNNING') {
            logError(closeError)
          }
          resolve()
        })
      } catch (error) {
        const closeError = error as NodeJS.ErrnoException
        if (closeError.code !== 'ERR_SERVER_NOT_RUNNING') {
          logError(error)
        }
        resolve()
      }
    })
    return flow.serverClosePromise
  }
}

export async function createAndStoreApiKey(
  accessToken: string,
): Promise<string | null> {
  // Call create_api_key endpoint
  const createApiKeyResp = await fetch(OAUTH_CONFIG.API_KEY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  let apiKeyData
  let errorText = ''

  try {
    apiKeyData = await createApiKeyResp.json()
  } catch (_e) {
    // If response is not valid JSON, get as text for error logging
    errorText = await createApiKeyResp.text()
  }

  if (createApiKeyResp.ok && apiKeyData && apiKeyData.raw_key) {
    const apiKey = apiKeyData.raw_key

    // Store in global config
    const config = getGlobalConfig()

    // Note: API key is now managed per model profile

    // Add to approved list
    if (!config.customApiKeyResponses) {
      config.customApiKeyResponses = { approved: [], rejected: [] }
    }
    if (!config.customApiKeyResponses.approved) {
      config.customApiKeyResponses.approved = []
    }

    const normalizedKey = normalizeApiKeyForConfig(apiKey)
    if (!config.customApiKeyResponses.approved.includes(normalizedKey)) {
      config.customApiKeyResponses.approved.push(normalizedKey)
    }

    // Save config
    saveGlobalConfig(config)

    // Reset the Anthropic client to force creation with new API key
    try {
      const { resetAnthropicClient } = await import('#core/ai/llm')
      resetAnthropicClient()
    } catch {
      logError(
        'OAuth API key created, but the Anthropic client cache could not be reset.',
      )
    }

    return apiKey
  }

  return null
}
