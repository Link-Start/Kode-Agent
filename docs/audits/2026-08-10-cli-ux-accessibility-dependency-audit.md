# CLI UX, accessibility, and dependency audit — 2026-08-10

## Scope and interaction model

Kode keeps its agent-first terminal workflow. The intended path is:

1. New users start at `/config` and see a concise route to `/onboarding`,
   `/model`, `/permissions`, and `/mcp`; advanced rendering and editor options
   remain behind one explicit keyboard transition.
2. A request reports a plain-language preparation or generation state and an
   explicit `Esc cancel` affordance. Tool activity remains in the transcript.
3. `/tasks` shows only in-process background snapshots. `/runs status` shows
   local durable-run records. Neither label is evidence that a remote task,
   provider request, or agent completed successfully.

No secret value is rendered by the new configuration or run-history output.

## Issue matrix

| Area                                   | Finding                                                                                                            | Bounded change                                                                                                                                                 | Verification                                                                             | Remaining boundary                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dark, light, and translucent terminals | `dimColor` relies on ANSI faint and made instructional, session, search, and task text depend on terminal opacity. | Promote normal-size secondary and accent roles to a 4.5:1 floor; use named secondary text and borders; add high-contrast light/dark themes.                    | Theme contrast unit tests and Ink overlay tests.                                         | Windows Terminal transparency and OS contrast behavior cannot be read reliably by the process.                                                                                       |
| Configuration                          | A flat settings page exposed preferences before explaining provider, model, permission, or MCP setup.              | Default `/config` view is Quick start; `Tab`/`a` opens Advanced preferences. It names the existing command boundaries and says keys are not shown.             | Ink overlay test checks quick-start copy, route transition, and mouse preference toggle. | It is wayfinding, not an automatic multi-screen wizard. Cross-command routing needs an explicit navigation contract.                                                                 |
| Request progress                       | `Prefilling` and `Decoding` were implementation terminology; interrupt wording varied.                             | Use `Preparing response`, `Generating response`, and `Esc cancel` in request and background overlays.                                                          | Animation and REPL static-output tests.                                                  | Provider retry policy and transport timeout semantics are owned by provider/adapter paths, not the view layer.                                                                       |
| Completed background work              | Process-local tasks could look like durable or remote history.                                                     | `/tasks` now has all/active/finished filters and labels local process scope. `/runs status` filters durable records and gives safe, structured retry guidance. | Task filter and durable-run presentation tests.                                          | `/tasks` still ends when the Kode process exits. `/runs reconcile` never restarts or reconnects remote work. Archive/restore requires a durable session schema and product decision. |
| Dependency health                      | Global typecheck had unresolved `ws` and `react-dom` declarations.                                                 | Add direct development-only `@types/ws` and `@types/react-dom`; keep runtime versions unchanged.                                                               | Frozen install and `bun run typecheck`.                                                  | Registry vulnerability audit could not run because the audit endpoint refused the connection.                                                                                        |

## Dependency review

- Environment checked: Bun 1.3.14; Node 26.7.0; package engine remains `>=20.19`.
- Installed development tree: 433 MB (`node_modules`); 874 resolved installs.
- Sampled direct runtime packages (`ink`, `react`, `react-dom`, `ws`, `undici`,
  `zod`, `commander`, `@anthropic-ai/sdk`, and `@modelcontextprotocol/sdk`) all
  declare MIT licenses.
- `bun outdated` identified newer patch/minor releases and breaking-major
  candidates. No runtime dependency was upgraded: Ink 7, Commander 15, Zod 4,
  Undici 8, Nanoid 6, and TypeScript 7 require isolated compatibility work.
- `bun audit` was attempted but failed with `ConnectionRefused: audit request
failed`; this is an unverified security boundary, not a clean audit result.

## Verification performed

```text
bun install --frozen-lockfile                 # 791 installs, no changes
bun run typecheck                             # pass
bun run lint                                  # pass: 221 warnings, 0 errors
bun run build:cli                             # pass
bun test <theme, terminal, task, runs, REPL, overlay suite>  # 69 pass, 0 fail
node cli.js --help                            # pass
```

The tests exercise Ink rendering, keyboard/mouse transitions, contrast
calculations, static output stability, status filtering, and secret-free retry
presentation. They do not claim a Windows physical-terminal pass.

`bun run format:check` still fails on 11 untouched files that predate this
change. Every touched source and audit file was formatted individually, and
`git diff --check` passes.

`node cli.js --help` also emits Node's `MODULE_TYPELESS_PACKAGE_JSON` warning
for the generated ESM entry point. It does not block the CLI help path, but it
is a separate packaging follow-up rather than evidence of a clean Node runtime.

## Windows release gate

Before release, test on a Windows machine with Windows Terminal acrylic enabled
and disabled, PowerShell and cmd, 100/125/150/200% scaling, dark/light/high
contrast modes, Chinese and English text, and a non-default monospace fallback.
For each state, capture `/config`, `/model`, active tool output, selected list
row, disabled row, error, focus border, `/tasks`, and `/runs status`. Confirm
that text remains legible without ANSI faint and that `Esc cancel` cancels only
the local active request. Do not mark this gate passed from macOS/Ink tests.

## Rollback and follow-up

- Roll back the UX work by reverting the listed UI/theme files and the two
  type-only dev dependency entries together with `bun.lock`; no migration or
  persisted data conversion is involved.
- First follow-up: add an explicit navigation API so Quick start can transfer
  into onboarding/model flows and return with validation state.
- Second follow-up: define durable task/session lifecycle records with archive,
  restore, provider receipt, and safe continuation semantics.
- Third follow-up: run a separate dependency-upgrade branch with provider and
  Ink compatibility tests, a package-size baseline, SBOM/license scan, and a
  registry audit when network access is available.
