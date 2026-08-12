import { afterEach, describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import React from 'react'
import { Text } from 'ink'

import { KeypressProvider } from '#ui-ink/contexts/KeypressContext'
import { createInkHarnessManager, createInkTestHarness } from './inkTestHarness'

const harnessManager = createInkHarnessManager()
let selectFile: ((value: string) => void) | null = null

afterEach(async () => {
  await harnessManager.cleanup()
  mock.restore()
  selectFile = null
})

function mockOpenFileDependencies(): void {
  mock.module('child_process', () => ({
    spawn: () => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        kill: () => {},
      })
      queueMicrotask(() => {
        child.stdout.emit('data', 'src/example.ts\n')
        child.emit('exit', 0)
      })
      return child
    },
  }))
  mock.module('#core/utils/state', () => ({
    getCwd: () => '/tmp/kode-open-file-test',
  }))
  mock.module('#ui-ink/components/CustomSelect/select', () => ({
    Select: ({ onChange }: { onChange?: (value: string) => void }) => {
      React.useEffect(() => {
        selectFile = onChange ?? null
        return () => {
          selectFile = null
        }
      }, [onChange])

      return <Text>Test file selector</Text>
    },
  }))
}

function chooseTestFile(): void {
  selectFile?.('src/example.ts')
}

describe('TUI E2E regression (Ink render): OpenFileScreen', () => {
  test('starts one editor launch for rapid file selections and ignores completion after unmount', async () => {
    let launches = 0
    let resolveEditor:
      ((value: { ok: true; editorLabel: string }) => void) | null = null
    const finishEditor = (): void => {
      resolveEditor?.({ ok: true, editorLabel: 'test-editor' })
    }

    mockOpenFileDependencies()
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: () => {
        launches += 1
        return new Promise<{ ok: true; editorLabel: string }>(resolve => {
          resolveEditor = resolve
        })
      },
    }))

    const { OpenFileScreen } =
      await import('#ui-ink/screens/overlays/OpenFileScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <OpenFileScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    expect(selectFile).not.toBeNull()
    chooseTestFile()
    chooseTestFile()
    await h.wait(25)

    expect(launches).toBe(1)
    expect(h.getOutput()).toContain('Opening src/example.ts…')

    h.unmount()
    finishEditor()
    await h.wait(25)
  })

  test('reports launcher errors and allows another file to be selected', async () => {
    let launches = 0

    mockOpenFileDependencies()
    mock.module('#cli-utils/externalEditor', () => ({
      launchExternalEditorForFilePath: async () => {
        launches += 1
        throw new Error('temporary editor failure')
      },
    }))

    const { OpenFileScreen } =
      await import('#ui-ink/screens/overlays/OpenFileScreen')
    const h = createInkTestHarness(
      <KeypressProvider>
        <OpenFileScreen onDone={() => {}} />
      </KeypressProvider>,
    )
    harnessManager.track(h)

    await h.wait(50)
    expect(selectFile).not.toBeNull()
    chooseTestFile()
    await h.wait(25)

    expect(h.getOutput()).toContain('Failed to open: temporary editor failure')

    chooseTestFile()
    await h.wait(25)
    expect(launches).toBe(2)
  })
})
