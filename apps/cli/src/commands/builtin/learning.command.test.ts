import { describe, expect, test } from 'bun:test'

import { parseLearningCommandArgs } from './learning'

describe('/learning command parser', () => {
  test('accepts the auditable project-learning actions', () => {
    expect(parseLearningCommandArgs('list')).toEqual({
      kind: 'list',
      includeRetired: false,
    })
    expect(parseLearningCommandArgs('list all')).toEqual({
      kind: 'list',
      includeRetired: true,
    })
    expect(parseLearningCommandArgs('snapshots')).toEqual({
      kind: 'snapshots',
    })
    expect(
      parseLearningCommandArgs('reject record-1 stale test command'),
    ).toEqual({
      kind: 'reject',
      id: 'record-1',
      reason: 'stale test command',
    })
  })

  test('fails closed for unsupported input', () => {
    expect(parseLearningCommandArgs('reject')).toEqual({
      kind: 'invalid',
      message: 'A learning ID is required.',
    })
    expect(parseLearningCommandArgs('list candidates')).toEqual({
      kind: 'invalid',
      message: 'Usage: /learning list [all]',
    })
  })
})
