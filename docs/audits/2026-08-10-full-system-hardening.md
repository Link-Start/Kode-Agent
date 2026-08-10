# Full-system hardening audit — 2026-08-10

## Scope and ownership

This pass covered the CLI, daemon transport, browser UI, configuration parsing,
archive extraction, OAuth, external-editor launch, network fetches, dependency
governance, and their test boundaries. Existing concurrent work in model
selection, reasoning streams, review commands, and engine verification was not
rewritten; it was included in whole-workspace validation only.

## Changes and evidence

| Area                               | Finding                                                                                                                                | Change                                                                                                                                                                                                                   | Verification                                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Daemon authentication              | Short bearer tokens and permissive token-file modes reduced credential strength.                                                       | Use the full 128-bit UUID token, rotate legacy short values, and enforce `0700` directories plus `0600` files where POSIX modes exist.                                                                                   | Token tests, frozen install, full workspace suite, and a real daemon/browser session.                                 |
| HTTP and WebSocket limits          | Requests and WS messages had no explicit application-level size ceiling.                                                               | Add fail-closed 16 MiB defaults, validate overrides, count streamed bytes, reject oversized bodies with `413`, limit headers, and bound timeouts.                                                                        | Declared-length and chunked-body tests; HTTP load tests at concurrency 10 and 50.                                     |
| Browser security and credential UX | The URL token remained in browser history, static responses lacked a consistent policy, and Settings rendered the token as plain text. | Move the token into session storage and remove it from the URL, add CSP and browser hardening headers, cache only fingerprinted assets, and render a labelled password input without spelling/autocomplete assistance.   | Static header tests, Settings markup test, production build, and browser inspection of Chat, Schedules, and Settings. |
| Web bundle cost                    | Markdown and secondary routes were in the initial bundle.                                                                              | Lazy-load Markdown, Schedules, and Settings behind Suspense boundaries.                                                                                                                                                  | Production build chunk report and browser resource inspection.                                                        |
| WebFetch SSRF                      | URL syntax checks did not cover DNS answers, special-use ranges, DNS rebinding, or each redirect hop.                                  | Validate public IPv4/IPv6 literals and every DNS answer, pin connections to the approved addresses while preserving the TLS hostname, reject mixed results, revalidate redirects, cancel redirect bodies, and cap loops. | Dedicated security tests plus a real pinned HTTPS response from a public IP.                                          |
| Archive extraction                 | Unbounded expansion, corrupt TAR headers, duplicate paths, and hierarchy conflicts could consume resources or create partial output.   | Add input, entry-count, per-entry, and extracted-byte limits; validate ZIP metadata and TAR checksums; stage validation before writes; separate TAR metadata overhead from file-content budgets.                         | Eleven ZIP/TAR tests, three randomized repetitions, and a simulated 1.6 MiB extraction benchmark.                     |
| Configuration frontmatter          | Three parsers had divergent delimiter and error behavior; one used a larger transitive parser tree.                                    | Centralize a size-bounded YAML parser with standalone delimiters and fail-closed callers; remove `gray-matter`.                                                                                                          | Frontmatter, validator, output-style, custom-command, and migration tests.                                            |
| Permission and OAuth lifecycle     | A rejected permission promise could hang a turn; OAuth state/server failures could leave flows pending or reuse PKCE material.         | Settle permission failures as denials, keep callbacks current, create a fresh PKCE verifier/state per flow, bind callbacks to loopback, close invalid callbacks, and reject superseded or setup-failed flows.            | Permission-hook E2E, OAuth UI E2E, typecheck, and full suite.                                                         |
| External editor                    | Shell-based editor execution admitted metacharacter expansion and prompt files inherited permissive defaults.                          | Parse command/arguments without a shell, reject operators, support quoted Unix/Windows paths, and create prompt files with mode `0600`.                                                                                  | Five editor tests repeated in randomized order.                                                                       |
| React lifecycle                    | Stale dependencies, unstable constants, overlapping polling, and focus-state effects caused warnings or could apply stale results.     | Stabilize refs and derived values, serialize polling, cancel stale responses, and narrow MCP effects to route identity rather than transient focus state.                                                                | Zero React Hook warnings and isolated overlay/misc E2E suites (16 and 47 tests).                                      |
| Dependencies and CI                | Security auditing was not a first-class CI gate and vulnerable transitive versions remained selectable.                                | Add `security:audit`, run it in CI/release verification, pin patched overrides, and make `ip-address` direct because runtime code imports it.                                                                            | `bun audit`: no vulnerabilities; frozen install made no changes.                                                      |

## Performance results

- Production Web initial JavaScript (main plus JSX runtime) moved from about
  641.9 kB raw / 190.2 kB gzip to 481.3 kB raw / 143.2 kB gzip, a reduction
  of about 25%. Markdown is now a 154.7 kB raw / 46.0 kB gzip lazy chunk.
- A real local HTTP daemon completed 10,000 requests with zero failures at
  22,955 requests/s (concurrency 10) and 10,876 requests/s (concurrency 50).
- The archive simulation extracted 1.64 MB per run over 100 runs at about
  616 MiB/s; average latency was 2.54 ms, p50 1.82 ms, and p95 6.60 ms.
- A quiet five-run CLI startup sample averaged 531 ms to first render and
  604 ms to prompt ready at 281 MB RSS. A separate three-run verification after
  adding percentile reporting measured p50/p95 at 529/705 ms for first render
  and 603/777 ms for prompt ready. Earlier loaded-machine outliers reached
  2.6 seconds, so p50/p95 are retained alongside means.

These are local macOS measurements, not cross-platform service-level
guarantees.

## Verification gates

```text
bun install --frozen-lockfile     pass, no changes
bun run format:check              pass
bun run lint                      pass (no React Hook warnings)
bun run typecheck                 pass
bun run security:audit            pass, no vulnerabilities
bun run test                      452/452 test files passed
bun run build                     pass
node cli.js --help                pass
critical randomized repetitions  pass
real browser daemon flow          pass
```

The repository still has 111 `no-empty` warnings for deliberately silent
best-effort cleanup/fallback catches. They are below the existing lint budget
and do not block the gate, but each should be given contextual logging or an
intent comment when its owning subsystem is changed.

## Remaining boundaries

- DNS interception products that synthesize `198.18.0.0/15` fake addresses are
  rejected by default because that range is not globally routable. Such
  environments need an explicit trusted proxy integration rather than silently
  weakening the SSRF boundary.
- The macOS checkout cannot assemble Linux x64 and arm64 seccomp binaries. The
  release workflow builds both artifacts on Linux and stages them before the
  prepublish check; local `prepublish-check` therefore remains intentionally
  fail-closed and now prints the exact preparation command.
- OAuth production endpoints are empty in this source snapshot, so a real
  provider exchange was not claimed. The lifecycle and UI paths were tested
  with controlled substitutes.
- Windows terminal behavior, Linux seccomp execution, provider credentials,
  and remote deployment remain platform or credential gates and were not
  inferred from local tests.
