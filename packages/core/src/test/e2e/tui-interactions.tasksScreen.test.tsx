import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'

import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'
import {
  __removeBackgroundAgentTaskForTests,
  getBackgroundAgentTaskSnapshot,
  upsertBackgroundAgentTask,
  type BackgroundAgentTaskRuntime,
} from '#core/utils/backgroundTasks'

const harnessManager = createInkHarnessManager()

async function waitForOutput(
  harness: ReturnType<typeof createInkTestHarness>,
  expected: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (harness.getOutput().includes(expected)) return
    await harness.wait(25)
  }

  throw new Error(
    `Timed out waiting for ${expected}: ${harness.getOutput().slice(-4_000)}`,
  )
}

async function waitFor(
  condition: () => boolean,
  description: string,
  timeoutMs = 2_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (condition()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

afterEach(async () => {
  __removeBackgroundAgentTaskForTests('agent-1')
  await harnessManager.cleanup()
  mock.restore()
})

function mockTasksDependencies(): void {
  mock.module('#core/tasks/backgroundRegistry', () => ({
    getBackgroundTaskOutputFilePath: (taskId: string) =>
      `/tmp/kode-task-${taskId}.log`,
    killBackgroundTask: () => false,
    listOwnedBackgroundTaskSnapshots: () => [
      {
        taskId: 'agent-1',
        taskType: 'local_agent',
        status: 'running',
        description: 'Test agent task',
        cwd: '/tmp/kode-tasks-test',
        sessionId: 'captured-session-1',
        subagentType: 'reviewer',
        model: 'task',
        outputFile: '/tmp/kode-task-agent-1.log',
        startedAt: 0,
        prompt: 'test prompt',
      },
    ],
    readBackgroundTaskOutputTailLines: () => [],
  }))
  mock.module('#protocol/utils/kodeAgentSessionLog', () => ({
    getAgentLogFilePath: (args: {
      cwd: string
      sessionId: string
      agentId: string
    }) => `${args.cwd}/.kode/${args.sessionId}/${args.agentId}.jsonl`,
  }))
}

describe('TUI E2E regression (Ink render): TasksScreen', () => {
  test('starts one output or log editor launch and ignores completion after unmount', async () => {
    let launches = 0
    let resolveEditor:
      ((value: { ok: true; editorLabel: string }) => void) | null = null
    const finishEditor = (): void => {
      resolveEditor?.({ ok: true, editorLabel: 'test-editor' })
    }

    mockTasksDependencies()
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: () => {
        launches += 1
        return new Promise<{ ok: true; editorLabel: string }>(resolve => {
          resolveEditor = resolve
        })
      },
    }))

    const { TasksScreen } = await import('#ui-ink/screens/overlays/TasksScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <TasksScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Agent: agent-1 (running)')
    h.stdin.write('o')
    h.stdin.write('l')
    h.stdin.write('o')
    await waitForOutput(h, 'Opening output in external editor…')

    expect(launches).toBe(1)
    expect(h.getOutput()).toContain('Opening output in external editor…')

    h.unmount()
    finishEditor()
    await h.wait(25)
  })

  test('reports unexpected editor launcher failures and permits retry', async () => {
    let launches = 0
    const launchedPaths: string[] = []

    mockTasksDependencies()
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: async (path: string) => {
        launches += 1
        launchedPaths.push(path)
        throw new Error('temporary editor failure')
      },
    }))

    const { TasksScreen } = await import('#ui-ink/screens/overlays/TasksScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <TasksScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Agent: agent-1 (running)')
    h.stdin.write('o')
    await waitForOutput(
      h,
      'Unable to open the external editor. Check $EDITOR and try again.',
    )

    expect(launches).toBe(1)

    h.stdin.write('l')
    await waitFor(() => launches === 2, 'retry launcher call')
    expect(launches).toBe(2)
    expect(launchedPaths[1]).toBe(
      '/tmp/kode-tasks-test/.kode/captured-session-1/agent-1.jsonl',
    )
  })

  test('shows captured execution identity in task details', async () => {
    mockTasksDependencies()
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: async () => ({
        ok: true as const,
        editorLabel: 'test-editor',
      }),
    }))

    const { TasksScreen } = await import('#ui-ink/screens/overlays/TasksScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <TasksScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'workspace: /tmp/kode-tasks-test')
    h.stdin.write('\r')
    await waitForOutput(h, 'Workspace: /tmp/kode-tasks-test')
    expect(h.getOutput()).toContain('Agent type: reviewer')
    expect(h.getOutput()).toContain('Model: task')
    expect(h.getOutput()).toContain('Session: captured-session-1')
  })

  test('queues reviewed guidance for the selected running agent', async () => {
    mockTasksDependencies()
    const task: BackgroundAgentTaskRuntime = {
      type: 'async_agent',
      agentId: 'agent-1',
      parentAgentId: 'main',
      description: 'Test agent task',
      prompt: 'test prompt',
      status: 'running',
      cwd: '/tmp/kode-tasks-test',
      sessionId: 'captured-session-1',
      startedAt: Date.now(),
      messages: [],
      guidance: [],
      abortController: new AbortController(),
      done: Promise.resolve(),
    }
    upsertBackgroundAgentTask(task)
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: async () => ({
        ok: true as const,
        editorLabel: 'test-editor',
      }),
    }))

    const { TasksScreen } = await import('#ui-ink/screens/overlays/TasksScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <TasksScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await waitForOutput(h, 'Agent: agent-1 (running)')
    h.stdin.write('g')
    await waitForOutput(h, 'Guidance for agent-1')
    h.stdin.write('Prioritize the cancellation race.')
    h.stdin.write('\r')
    await waitForOutput(h, 'application is not immediate')

    expect(
      getBackgroundAgentTaskSnapshot('agent-1')?.guidance?.[0],
    ).toMatchObject({
      body: 'Prioritize the cancellation race.',
      status: 'queued',
    })
  })
})
