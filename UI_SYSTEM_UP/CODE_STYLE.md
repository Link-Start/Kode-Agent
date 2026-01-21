# CODE_STYLE.md - Kode CLI TUI Refactor

## 1. Naming & Structure
- Components: PascalCase (`MainLayout`, `PromptInput`)
- Hooks: `useX` prefix
- Files: match component name or feature scope
- Avoid deep nesting beyond 3 levels

## 2. Error Handling
- No exceptions thrown inside render
- Convert runtime errors to user‑readable messages
- Use error codes from TDD (UI-1001, UI-2001, etc.)

## 3. Logging
- Use `debugLogger.ui()` for UI issues
- Do not use `console.log` in production UI
- Log critical UI errors into `.kode/errors/`

## 4. State Management Rules
- Avoid state updates during render
- Prefer selector store or reducers
- Use memoization for stable subtrees

## 5. Component Template
```ts
export function ComponentName(props: Props): React.ReactNode {
  // 1. compute layout
  // 2. compute derived values
  // 3. render
  return <Box>...</Box>
}
```

## 6. Review Checklist
- [ ] No runtime measurement (`measureElement`)
- [ ] Input box height stable
- [ ] ESC behavior stack‑safe
- [ ] Lists virtualized
- [ ] No layout jitter on resize
- [ ] Main buffer remains default
