import { describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { GoalService } from '@kode/core/goals'
import { createDefaultToolPermissionContext } from '#core/types/toolPermissionContext'

import { GoalScheduleRunner } from './goalScheduleRunner'
import type { DaemonSession } from '../ws/types'

function session(): DaemonSession {
  return {
    sessionId: 'session-1',
    cwd: '/workspace',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    forkedFromSessionId: null,
    forkRootSessionId: null,
    clients: new Set(),
    messages: [],
    readFileTimestamps: {},
    responseState: {},
    toolPermissionContext: {
      ...createDefaultToolPermissionContext(),
      mode: 'default',
    },
    activeAbortController: null,
    turnInFlight: false,
    inflightPermissionRequests: new Map(),
    nextSequence: 0,
    eventJournal: [],
    turnsByClientMessageUuid: new Map(),
  }
}

describe('GoalScheduleRunner', () => {
  test('claims and dispatches due work only for eligible connected sessions', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-schedule-runner-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      const goal = service.createGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'Check CI',
        schedule: {
          kind: 'interval',
          prompt: 'Check CI and report changes.',
          everyMs: 60_000,
          anchorAt: 1_000,
        },
      })
      const delivered: string[] = []
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async ({ schedule }) => {
          delivered.push(schedule.prompt)
        },
      })

      await runner.tick()
      await runner.tick()
      expect(delivered).toEqual(['Check CI and report changes.'])
      expect(service.getGoal(goal.id)).toMatchObject({ status: 'scheduled' })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('returns a failed one-off dispatch to a paused review state', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-schedule-failure-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      const goal = service.createGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'One-off task',
        schedule: { kind: 'once', prompt: 'Do work', runAt: 1_000 },
      })
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async () => {
          throw new Error('transport offline')
        },
      })

      await runner.tick()
      expect(service.getGoal(goal.id)).toMatchObject({ status: 'paused' })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('pauses a direct goal when dispatch returns without a terminal decision', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-direct-runner-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      const goal = service.startGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'Start immediately',
        now: 1_000,
      })
      const delivered: string[] = []
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async ({ schedule }) => {
          delivered.push(schedule.prompt)
          service.recordContinuation(schedule.goalId, {
            runId: schedule.runId,
            now: 1_001,
          })
        },
      })

      await runner.tick()
      await runner.tick()

      expect(delivered).toEqual(['Start immediately'])
      expect(service.getGoal(goal.id)).toMatchObject({
        status: 'paused',
        pausedReason:
          'Scheduled turn returned without a terminal goal decision.',
      })
      expect(service.getGoal(goal.id)?.activeRun).toBeUndefined()
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })

  test('does not overwrite a terminal decision applied by dispatch', async () => {
    const rootDir = mkdtempSync(join(tmpdir(), 'kode-goal-runner-terminal-'))
    try {
      const service = new GoalService({
        rootDir,
        clock: { now: () => 1_000 },
      })
      const goal = service.startGoal({
        cwd: '/workspace',
        sessionId: 'session-1',
        objective: 'Finish safely',
        now: 1_000,
      })
      const runner = new GoalScheduleRunner({
        service,
        listSessions: () => [session()],
        canDispatch: () => true,
        dispatch: async ({ schedule }) => {
          service.completeGoal(schedule.goalId, {
            runId: schedule.runId,
            now: 1_001,
            reason: 'All checks passed.',
          })
        },
      })

      await runner.tick()

      expect(service.getGoal(goal.id)).toMatchObject({ status: 'completed' })
    } finally {
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
