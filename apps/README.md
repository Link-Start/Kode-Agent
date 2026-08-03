# apps/

Application layer - each app is a standalone entrypoint.

## Structure

```
apps/
├── cli/        # Terminal application (Ink TUI)
├── server/     # API server / Daemon (HTTP/WebSocket)
└── web/        # Web frontend (React + Vite)
```

## Current Apps

### @kode/cli

Terminal-based interactive AI assistant with Ink TUI.

```bash
pnpm --filter @kode/cli dev
```

### @kode/server

Headless API server providing HTTP/WebSocket endpoints.

```bash
pnpm --filter @kode/server dev
```

### @kode/web

Browser-based frontend connecting to server via WebSocket.

```bash
pnpm --filter @kode/web dev
```

## Third-Party Integration

VS Code extensions or desktop applications can integrate with Kode
via the Daemon SDK (`@shareai-lab/kode/daemon-client`). These are
intended to live in separate repositories rather than this monorepo.

---

## Build

```bash
# Build all apps
pnpm build

# Build specific app
pnpm build:cli
pnpm build:server
pnpm build:web
```
