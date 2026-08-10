import { describe, expect, test } from 'bun:test'

import {
  assertPublicWebFetchTarget,
  fetchWithRedirectDetection,
  isPublicNetworkAddress,
  isValidWebFetchUrl,
  resolvePublicWebFetchTarget,
  type ResolvedWebFetchTarget,
} from '#tools/tools/network/WebFetchTool/utils'

function callPinnedLookup(
  target: ResolvedWebFetchTarget,
  hostname = target.hostname,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    target.lookup(hostname, { family: 0 }, (error, address, family) => {
      if (error) {
        reject(error)
        return
      }
      if (typeof address !== 'string' || typeof family !== 'number') {
        reject(new Error('Expected one pinned address'))
        return
      }
      resolve({ address, family })
    })
  })
}

describe('WebFetch network boundary', () => {
  test('rejects private and special-use IPv4 and IPv6 literals', () => {
    const blocked = [
      '127.0.0.1',
      '169.254.169.254',
      '10.0.0.1',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:7f00:1',
      '64:ff9b::7f00:1',
      '2001:db8::1',
    ]

    for (const address of blocked) {
      expect(isPublicNetworkAddress(address)).toBe(false)
    }
    expect(isPublicNetworkAddress('8.8.8.8')).toBe(true)
    expect(isPublicNetworkAddress('2606:4700:4700::1111')).toBe(true)
  })

  test('normalizes alternate IP spellings before validating URLs', () => {
    expect(isValidWebFetchUrl('https://example.com/docs')).toBe(true)
    expect(isValidWebFetchUrl('http://2130706433/')).toBe(false)
    expect(isValidWebFetchUrl('http://0177.0.0.1/')).toBe(false)
    expect(isValidWebFetchUrl('http://[::ffff:127.0.0.1]/')).toBe(false)
    expect(isValidWebFetchUrl('http://user:pass@example.com/')).toBe(false)
  })

  test('rejects hostnames when any DNS result is non-public', async () => {
    await expect(
      assertPublicWebFetchTarget('https://service.example/', async () => [
        { address: '93.184.216.34' },
        { address: '10.0.0.4' },
      ]),
    ).rejects.toThrow('non-public network address')

    await expect(
      assertPublicWebFetchTarget('https://service.example/', async () => [
        { address: '93.184.216.34' },
      ]),
    ).resolves.toBeUndefined()
  })

  test('pins the actual connection lookup while retaining Host and TLS SNI', async () => {
    let resolverCalls = 0
    const target = await resolvePublicWebFetchTarget(
      'https://service.example:8443/docs',
      async () => {
        resolverCalls += 1
        return resolverCalls === 1
          ? [{ address: '93.184.216.34', family: 4 }]
          : [{ address: '10.0.0.4', family: 4 }]
      },
    )

    expect(target.authority).toBe('service.example:8443')
    expect(target.servername).toBe('service.example')
    expect(await callPinnedLookup(target)).toEqual({
      address: '93.184.216.34',
      family: 4,
    })
    expect(resolverCalls).toBe(1)
    await expect(
      callPinnedLookup(target, 'attacker.example'),
    ).rejects.toMatchObject({ code: 'ENOTFOUND' })
  })

  test('does not perform a second DNS lookup between validation and connect', async () => {
    let resolverCalls = 0
    let connectedAddress = ''
    const result = await fetchWithRedirectDetection(
      'https://service.example/resource',
      new AbortController().signal,
      {
        lookupHostname: async () => {
          resolverCalls += 1
          return resolverCalls === 1
            ? [{ address: '93.184.216.34', family: 4 }]
            : [{ address: '127.0.0.1', family: 4 }]
        },
        fetchImpl: async target => {
          connectedAddress = (await callPinnedLookup(target)).address
          return new Response('safe')
        },
      },
    )

    expect(result.type).toBe('response')
    expect(connectedAddress).toBe('93.184.216.34')
    expect(resolverCalls).toBe(1)
  })

  test('fails closed when a same-host redirect rebinds to a private address', async () => {
    let resolverCalls = 0
    let fetchCalls = 0

    await expect(
      fetchWithRedirectDetection(
        'https://service.example/start',
        new AbortController().signal,
        {
          lookupHostname: async () => {
            resolverCalls += 1
            return resolverCalls === 1
              ? [{ address: '93.184.216.34', family: 4 }]
              : [{ address: '127.0.0.1', family: 4 }]
          },
          fetchImpl: async () => {
            fetchCalls += 1
            return new Response('', {
              status: 302,
              headers: { location: '/next' },
            })
          },
        },
      ),
    ).rejects.toThrow('non-public network address')
    expect(resolverCalls).toBe(2)
    expect(fetchCalls).toBe(1)
  })

  test('revalidates same-host redirect targets and stops redirect loops', async () => {
    let fetchCalls = 0
    let lookupCalls = 0
    const response = await fetchWithRedirectDetection(
      'https://service.example/start',
      new AbortController().signal,
      {
        lookupHostname: async () => {
          lookupCalls += 1
          return [{ address: '93.184.216.34' }]
        },
        fetchImpl: async target => {
          fetchCalls += 1
          return new Response('', {
            status: 303,
            headers: {
              location: `${new URL(target.url).pathname}/next`,
            },
          })
        },
      },
    ).catch(error => error)

    expect(response).toBeInstanceOf(Error)
    expect((response as Error).message).toContain('Too many redirects')
    expect(fetchCalls).toBe(10)
    expect(lookupCalls).toBe(10)
  })
})
