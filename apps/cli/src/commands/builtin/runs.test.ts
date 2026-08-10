import { describe, expect, test } from 'bun:test'

import type { DurableRun } from '#core/runs'

import {
  __formatDurableRunForTests,
  __formatDurableRunListForTests,
} from './runs'

function makeRun(overrides: Partial<DurableRun>): DurableRun {
  return {
    version: 1,
    id: 'run-default',
    kind: 'agent',
    status: 'completed',
    cwd: '/workspace',
    createdAt: 1,
    updatedAt: 1,
    heartbeatAt: 1,
    ...overrides,
  }
}

describe('/runs status presentation', () => {
  test('filters durable records by lifecycle and sorts newest first', () => {
    const output = __formatDurableRunListForTests({
      filter: 'failed',
      runs: [
        makeRun({ id: 'finished', status: 'completed', updatedAt: 30 }),
        makeRun({ id: 'failed', status: 'failed', updatedAt: 10 }),
        makeRun({ id: 'interrupted', status: 'interrupted', updatedAt: 20 }),
      ],
    })

    expect(output).toContain(
      'These statuses do not prove remote task completion.',
    )
    expect(output).toContain('interrupted · agent · interrupted')
    expect(output).toContain('failed · agent · failed')
    expect(output).not.toContain('finished · agent · completed')
    expect(output.indexOf('interrupted · agent')).toBeLessThan(
      output.indexOf('failed · agent'),
    )
  })

  test('offers bounded retry guidance without rendering raw failure details', () => {
    const output = __formatDurableRunForTests(
      makeRun({
        status: 'failed',
        error: 'sk-live-secret-must-not-be-reprinted',
        telemetry: {
          mode: 'headless',
          inputFormat: 'text',
          outputFormat: 'text',
          promptChars: 20,
          toolCount: 1,
          failure: {
            kind: 'provider',
            message: 'sk-live-secret-must-not-be-reprinted',
            retryable: true,
            recommendedAction:
              'Retry with backoff after checking provider status.',
          },
        },
      }),
    )

    expect(output).toContain('retry available')
    expect(output).toContain('next: Retry with backoff')
    expect(output).not.toContain('sk-live-secret-must-not-be-reprinted')
  })
})
