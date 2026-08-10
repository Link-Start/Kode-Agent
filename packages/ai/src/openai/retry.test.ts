import { describe, expect, test } from 'bun:test'

import { isRetryableHttpStatus } from './retry'

describe('isRetryableHttpStatus', () => {
  test('does not retry client configuration failures', () => {
    expect(isRetryableHttpStatus(400)).toBe(false)
    expect(isRetryableHttpStatus(401)).toBe(false)
    expect(isRetryableHttpStatus(404)).toBe(false)
  })

  test('retries transient provider failures', () => {
    expect(isRetryableHttpStatus(408)).toBe(true)
    expect(isRetryableHttpStatus(409)).toBe(true)
    expect(isRetryableHttpStatus(429)).toBe(true)
    expect(isRetryableHttpStatus(500)).toBe(true)
  })
})
