import { afterEach, describe, expect, test } from 'bun:test'

import {
  AgentAlreadyRunningError,
  AgentSupervisor,
  AgentTimeoutError,
} from '#core/utils/agentSupervisor'

afterEach(() => {
  AgentSupervisor.__resetForTests()
})

describe('AgentSupervisor', () => {
  test('rejects a concurrent resume of the same logical agent', () => {
    const first = AgentSupervisor.acquire('same-agent')

    expect(() => AgentSupervisor.acquire('same-agent')).toThrow(
      AgentAlreadyRunningError,
    )
    expect(AgentSupervisor.activeCount).toBe(1)

    first.release()
    expect(AgentSupervisor.activeCount).toBe(0)
  })

  test('actively aborts a run at the wall-clock deadline', async () => {
    const controller = new AbortController()
    const supervisor = AgentSupervisor.acquire('timed-agent', {
      maxExecutionTimeMs: 20,
    })
    supervisor.attachAbortController(controller)

    await new Promise<void>(resolve => {
      controller.signal.addEventListener('abort', () => resolve(), {
        once: true,
      })
    })

    expect(controller.signal.aborted).toBe(true)
    expect(controller.signal.reason).toBeInstanceOf(AgentTimeoutError)
    supervisor.release()
    expect(AgentSupervisor.activeCount).toBe(0)
  })

  test('release only removes the lease that owns the map entry', () => {
    const oldLease = AgentSupervisor.acquire('fenced-agent')
    oldLease.release()
    const currentLease = AgentSupervisor.acquire('fenced-agent')

    oldLease.release()
    expect(AgentSupervisor.activeCount).toBe(1)

    currentLease.release()
    expect(AgentSupervisor.activeCount).toBe(0)
  })
})
