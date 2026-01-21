# PRD - Kode CLI TUI System Refactor (Delegation Pack)

## 0. Document Purpose
This PRD is written for contributors with zero repository context. It defines the goals, scope, UX constraints, phased delivery plan, and acceptance criteria for a full refactor of the Kode CLI TUI.

## 1. Goal
Deliver a **high‑performance, flicker‑free, terminal‑native** TUI that feels as smooth and free as a native shell (Warp‑like), while supporting multi‑level settings, sidebars, notifications, and all existing Kode capabilities.

## 2. Scope
**In scope**
- Navigation system: Screen stack + overlay stack + consistent ESC
- Deterministic layout: no runtime measuring or height guessing
- Input system: stable multiline input, IME guard, history, shortcuts
- Completion system: command/file/@resource with async cache
- Sidebars: file tree + status/info + notifications
- Transcript: follow/lock scroll + free copy + file export
- Cross‑platform support: Windows cmd/PowerShell, Linux, macOS
- Kode‑first compatibility: `.kode` primary, `.claude` read only

**Out of scope**
- Web or desktop UI as primary interface
- Replacing orchestration logic in `packages/core`
- Introducing hard menu flows as the primary UX path

## 3. Users & Mental Model
- **Primary:** power users who want minimal friction and maximal control
- **Expectations:** stable input, predictable ESC back, fast feedback, easy copying
- **Non‑negotiables:** natural language as primary path; menus are secondary

## 4. UX Constraints (Non‑Negotiable)
- **Main buffer default**: keep terminal scrollback and native copy
- **No implicit screen clearing**: only `/clear` can clear
- **Deterministic layout**: no runtime measurement (`measureElement`)
- **Top‑stack focus**: only the topmost screen/overlay receives input
- **Unified list/menus**: all long lists use virtualization
- **IME guard**: automatic completion suppressed during composition

## 5. Functional Requirements
### 5.1 Core Interaction
- REPL with streaming output and frozen blocks
- Stable input box (multi‑line, history, paste protection)
- Slash commands: `/help`, `/model`, `/theme`, `/config` (plus existing)
- Permission mode switching (shortcut + clear indicator)

### 5.2 Completion
- Command completion (`/`)
- File completion (`@`, `./`, `../`, `/`, `~`)
- Resource mention completion (`@`)
- Async scanning + LRU cache + abortable updates

### 5.3 Navigation
- Screen stack (primary screens)
- Overlay stack (dialogs/menus)
- ESC returns consistently (overlay → screen → exit)

### 5.4 Workbench Mode
- Default: minimal terminal mode (no sidebars)
- Toggle: Workbench mode with left/right sidebars
- Left sidebar: file tree, quick path insertion
- Right sidebar: tasks, notifications, status

### 5.5 Logs & Transcript
- Free scroll + copy in main buffer
- `/transcript`: full text view + save/copy
- Always write logs to `.kode/logs/`

## 6. Interaction Details
- Input history with ↑/↓ (session history)
- Ctrl+R history search
- Alt/Option+M quick model switch (with fallback if conflict)
- Shift+Tab permission cycle (with fallback if conflict)
- Shift/Alt+Enter inserts newline
- ESC dismisses overlay; second ESC from root exits (configurable)

## 7. User Flows (>= 8)
1) Launch → REPL → enter task → stream output → copy from scrollback
2) `/model` → pick model → apply → ESC → return to REPL
3) `/theme` → pick theme → apply → ESC → return to REPL
4) Ctrl+B → open sidebar → choose file → insert path → ESC
5) Ctrl+R → history search → select → run
6) Long output → scroll up → copy → return to bottom
7) Permission prompt → approve/deny → return to REPL
8) Settings → subpage → ESC twice → back to REPL
9) Alt+M quick model switch → status update

## 8. Non‑Functional Requirements
- Input latency < 16ms
- Stable 30 FPS max render
- 10k+ line transcript scroll without jank
- No UI flicker under rapid input
- Windows cmd/PowerShell parity with macOS/Linux

## 9. Acceptance Criteria
- No "Cannot update a component while rendering" warnings
- No flicker when navigating menus or overlays
- ESC always returns one level reliably
- IME input does not trigger auto completion
- Copy/paste from scrollback works by default

## 10. Phased Delivery
**Phase 0: Architecture Skeleton**
- Goal: Navigation stack + Focus router + deterministic layout
- Output: new `ui/navigation`, `ui/layout`, `ui/input` scaffold
- Acceptance: ESC works across overlay/screen; no flicker regression

**Phase 1: Input & Completion Migration**
- Goal: TextBuffer + IME guard + async completion
- Output: `ui/input` controllers + new completion engine
- Acceptance: IME stable; completion async; history works

**Phase 2: Workbench Mode**
- Goal: sidebars + notifications + tasks panel
- Output: sidebar components + toggle shortcut
- Acceptance: toggle without flicker; no input displacement

**Phase 3: REPL Integration & Performance**
- Goal: REPL uses new layout + render scheduler
- Output: REPLView rewritten without measuring
- Acceptance: 10k line output stable; 30 FPS cap

## 11. References (Read These First)
- `AGENTS.md` - repo rules and commands
- `AGENT_CONTEXT/README.md` - product and architecture context
- `docs/product/11_post_human_blueprint.md` - product vision
- `TERMINAL_UI_ISSUES.md` - known UI bugs and root causes
- `TERMINAL_INPUT_BEST_PRACTICES.md` - input system guidance
- `apps/cli/src/ui/screens/REPL/REPLView.tsx` - flicker root
- `apps/cli/src/ui/contexts/KeypressContext.tsx` - key broadcast
