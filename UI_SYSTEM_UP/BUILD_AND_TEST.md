# BUILD_AND_TEST.md - Kode CLI TUI Refactor

## 1. Setup
```bash
bun install
```

## 2. Run Development
```bash
bun run dev
```

## 3. Tests
```bash
bun test
bun run typecheck
bun run format:check
```

## 4. Manual Acceptance Checks
1) **ESC Back Stack**: open overlay → ESC → returns one level
2) **Main Buffer Copy**: scrollback copy works by mouse selection
3) **IME Input**: Chinese input not interrupted by auto completion
4) **10k Lines**: simulate long streaming output, no flicker
5) **Resize**: 80x24 → 200x50 without layout jump

## 5. CI Minimum Gate
- `bun test` passes
- `bun run typecheck` passes
- `bun run format:check` passes

## 6. References
- `AGENTS.md`
- `TERMINAL_UI_ISSUES.md`
- `TERMINAL_INPUT_BEST_PRACTICES.md`
