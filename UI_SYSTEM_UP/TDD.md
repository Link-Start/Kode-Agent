# TDD - Kode CLI TUI System Refactor (Delegation Pack)

## 0. Document Purpose
This TDD defines architecture, interfaces, data structures, error handling, logging, and test strategy required to implement the PRD.

## 1. Architecture Overview
**Primary Layers**
1) Interaction/UI: `apps/cli/src/ui/**`
2) Orchestration: `packages/core/src/**`
3) Tools/Runtime: `packages/tools/src/**`, `packages/runtime/src/**`

**TUI Core Design**
- Render Kernel: Ink 6.x + incrementalRendering + FrameScheduler
- Navigation: ScreenStack + OverlayStack + DialogStack
- Focus: FocusManager + KeymapRegistry
- Layout: deterministic calculation (no `measureElement`)
- Input: TextBuffer + InputController (IME‑safe)
- Lists: VirtualList + SelectList (windowed)

## 2. Module Map
```
apps/cli/src/ui/
  core/
    renderer.ts
    terminal.ts
    frameScheduler.ts
  navigation/
    NavigationProvider.tsx
    ScreenStack.tsx
    useNavigation.ts
    screens.ts
    types.ts
  layout/
    Shell.tsx
    MainLayout.tsx
    constraints.ts
    responsive.ts
  input/
    TextBuffer.ts
    InputController.ts
    FocusManager.ts
    KeyboardManager.ts
  completion/
    CompletionEngine.ts
    FileSuggester.ts
    CommandSuggester.ts
    types.ts
  primitives/
    list/VirtualList.tsx
    menu/Menu.tsx
    feedback/Toast.tsx
  screens/
    REPL/REPLScreen.tsx
    overlays/...
```

## 3. Interfaces & Data Structures
### 3.1 Navigation
```ts
export type ScreenId =
  | 'repl' | 'resume' | 'onboarding'
  | 'help' | 'config' | 'model' | 'command-palette'
  | 'transcript' | 'tasks' | 'notifications'

export interface NavigationState {
  stack: ScreenId[]
  overlays: ScreenId[]
  params: Record<string, unknown>
}

export interface NavigationActions {
  push(id: ScreenId, params?: unknown): void
  pop(): void
  replace(id: ScreenId, params?: unknown): void
  showOverlay(id: ScreenId, params?: unknown): void
  hideOverlay(id?: ScreenId): void
  goBack(): boolean
}
```

### 3.2 Input
```ts
export interface InputState {
  buffer: TextBuffer
  mode: 'prompt' | 'bash' | 'background' | 'koding'
  cursorOffset: number
  isComposing: boolean
}

export interface InputController {
  insert(text: string): void
  deleteLeft(): void
  moveCursor(delta: number): void
  submit(): void
}
```

### 3.3 Completion
```ts
export interface CompletionContext {
  type: 'command' | 'file' | 'agent' | 'resource'
  prefix: string
  trigger: string | null
  cursorOffset: number
}

export interface CompletionEngine {
  getSuggestions(ctx: CompletionContext, signal: AbortSignal): Promise<Suggestion[]>
  warmup(cwd: string): void
  invalidate(path?: string): void
}
```

### 3.4 Scroll
```ts
export interface ScrollState {
  mode: 'follow' | 'locked'
  scrollTop: number
  maxScrollTop: number
}
```

## 4. Protocol & Error Codes
- UI-1001 LayoutOverflow
- UI-2001 KeyConflict
- UI-3001 CompletionTimeout
- UI-4001 ScrollLockError
- UI-5001 AltBufferUnsupported

Errors should be user‑readable in overlays and logged to `.kode/errors/`.

## 5. Logging & Observability
- UI flicker events → `debugLogger.ui` + `.kode/errors/`
- task output → `.kode/tasks/`
- transcript output → `.kode/logs/`
- render timing metrics (optional) → `.kode/metrics/`

## 6. State Machines
**Input**: idle → typing → composing → completion → history → idle
**Navigation**: screen stack push/pop, overlay push/pop
**Scroll**: follow ↔ locked
**Permission**: idle → prompt → approved/denied

## 7. Test Strategy
**Unit**
- layout constraints
- completion filtering and caching
- text buffer cursor correctness

**Integration**
- ESC navigation (overlay → screen)
- input history vs completion conflict

**E2E**
- 10k line streaming output
- window resize 80x24 → 200x50
- IME input under macOS + Windows

## 8. Repository Structure
- UI: `apps/cli/src/ui/**`
- Core: `packages/core/src/**`
- Tools: `packages/tools/src/**`
- Runtime: `packages/runtime/src/**`

## 9. Migration Plan (Implementation Order)
1) Introduce navigation stack + focus manager
2) Build deterministic layout shell
3) Implement input buffer + completion engine
4) Migrate overlays and REPL

## 10. References
- `AGENTS.md`
- `TERMINAL_UI_ISSUES.md`
- `TERMINAL_INPUT_BEST_PRACTICES.md`
- `apps/cli/src/ui/screens/REPL/REPLView.tsx`
