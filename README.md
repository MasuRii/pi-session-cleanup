# pi-session-cleanup

[![npm version](https://img.shields.io/npm/v/pi-session-cleanup?style=flat-square)](https://www.npmjs.com/package/pi-session-cleanup) [![License](https://img.shields.io/github/license/MasuRii/pi-session-cleanup?style=flat-square)](LICENSE)

Interactive session cleanup extension for the [Pi coding agent](https://github.com/mariozechner/pi).

<img width="1389" height="768" alt="image" src="https://github.com/user-attachments/assets/42464ca1-4a6c-4496-b13f-5bcc2093bf59" />

**pi-session-cleanup** provides a focused TUI command for batch-selecting historical sessions and deleting them safely with trash-first fallback and active session protection.

## Features

- **Interactive Session Cleanup** — Browse, select, and delete sessions via an intuitive modal interface
- **Scope Filtering** — View only orphaned sessions or all historical sessions
- **Batch Selection Controls** — Multi-select with Space, select all with `a`, keyboard navigation
- **Safe Delete Flow** — Excludes the currently active session and uses trash-first deletion with unlink fallback
- **Fresh Session Shortcut** — `/nix` starts a fresh session and removes the previous session after confirmation
- **Target Agent Handoff** — `/nix agent [name]` starts a fresh session with persisted active-agent metadata
- **Quit Cleanup Flow** — `/nix quit` schedules current-session deletion during Pi's graceful shutdown event
- **Improved Modal UX** — Centered overlay with bordered layout, concise single-line legend, status summary, and automatic icon fallback

## Installation

### Local Extension Folder

Place this folder in one of Pi's auto-discovery paths:

```text
~/.pi/agent/extensions/pi-session-cleanup     # Global default (when PI_CODING_AGENT_DIR is unset)
.pi/extensions/pi-session-cleanup               # Project-specific
```

Pi will auto-discover the extension on startup.

### As NPM Package

```bash
pi install npm:pi-session-cleanup
```

### Git Repository

```bash
pi install git:github.com/MasuRii/pi-session-cleanup
```

## Usage

### Commands

| Command | Arguments | Description |
|---------|-----------|-------------|
| `/session-cleanup` | — | Opens the session cleanup modal showing orphaned sessions only |
| `/session-cleanup current` | — | Opens modal with sessions from the current directory |
| `/session-cleanup all` | — | Opens modal showing all sessions |
| `/session-cleanup help` | — | Displays usage help |
| `/nix` | — | Starts a fresh session after confirmation and deletes the previous session |
| `/nix quit` | — | Deletes the current session during graceful shutdown and quits Pi |
| `/nix agent` | `[name]` | Starts a fresh session with a selected or explicitly named target agent |
| `/nix help` | — | Displays `/nix` usage help |

**Scopes:**

- **Default (no args)** — Shows orphaned sessions (sessions without a matching directory)
- **`current`** — Shows sessions from the current working directory
- **`all`** — Shows all historical sessions across all directories

### `/nix` Fresh Session Workflow

`/nix` is destructive by design and always asks for confirmation before deleting any session file.

- **`/nix`** starts a new session with the current agent and deletes the previous session only after `ctx.newSession()` succeeds.
- **`/nix agent [name]`** starts a new session with the selected target agent and writes an `active_agent` session entry so Pi can resume that agent context. Without `[name]`, the command opens an interactive agent picker; with `[name]`, it validates the name before continuing.
- **`/nix quit`** requires Pi builds that expose `ctx.shutdown()`. It schedules deletion of the current session and performs the delete from the `session_shutdown` event, so the session file is not removed until Pi has begun graceful shutdown.

Target agents are discovered from the nearest project agent folders (`.omp/agents`, `.pi/agents`, `.claude/agents`) plus user agent folders (`~/.omp/agents`, `$PI_CODING_AGENT_DIR/agents`, `~/.claude/agents`). If `pi-agent-router` is installed with custom `agentDiscovery` paths, those paths are reused.

### Modal Controls

When the session picker modal is open:

| Key | Action |
|-----|--------|
| `↑` / `↓` / `j` / `k` | Navigate up/down in the list |
| `PgUp` / `PgDn` | Page up/down through sessions |
| `Home` / `End` | Jump to first/last item |
| `Space` | Toggle selection of current item |
| `a` | Select all visible sessions |
| `r` | Refresh the session list |
| `Enter` | Confirm deletion of selected sessions |
| `Esc` / `q` / `Ctrl+C` | Cancel and close modal |

### Safety Guards

The extension includes multiple safety mechanisms:

1. **Active Session Protection** — The currently active session is never shown in the list and cannot be deleted
2. **Trash-First Deletion** — Sessions are moved to trash first; only falls back to permanent deletion if trash is unavailable
3. **Confirmation Required** — The modal requires explicit `Enter` keypress to proceed with deletion, and `/nix` commands require `ctx.ui.confirm()` approval
4. **Graceful Quit Guard** — `/nix quit` refuses to delete anything when the active Pi build does not expose `ctx.shutdown()`
5. **Escapable** — `Esc` or `q` immediately cancels without any changes

## Configuration

Configuration is stored at:

```text
Default global path: ~/.pi/agent/extensions/pi-session-cleanup/config.json
Actual global path: $PI_CODING_AGENT_DIR/extensions/pi-session-cleanup/config.json when PI_CODING_AGENT_DIR is set
```

A starter template is provided in `config/config.example.json`. On startup, the extension creates `config.json` with defaults if missing.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Master on/off switch for the extension |
| `iconMode` | `"auto" \| "nerd" \| "fallback"` | `"auto"` | Icon rendering mode for the modal UI (`auto` detects Nerd Font usage in supported terminals and safely falls back otherwise) |

### Icon Mode Overrides

You can override icon mode without editing config:

- `PI_SESSION_CLEANUP_ICON_MODE=nerd|fallback|auto`
- `PI_SESSION_CLEANUP_NERD_FONT=true|false` (or `PI_NERD_FONT=true|false`)

`auto` now prefers Nerd icons when Nerd Font is actually configured (including Windows Terminal profile/default font checks) and falls back to safe icons when detection is unavailable or uncertain.

## Development

```bash
npm run build    # Type-check with TypeScript
npm run lint     # Run linting (same as build)
npm run test     # Run test suite
npm run check    # Run full verification (build + test)
npm run package:dry-run
```

## Publishing

The package metadata follows the same publish-ready shape used by established Pi extensions:

- entrypoint: `index.ts`
- package exports: `.` → `./index.ts`
- Pi extension manifest: `pi.extensions`
- published files: source, README, changelog, license, and config template
- runtime `config.json`, tests, and build artifacts excluded from npm publication

## Related Pi Extensions

- [pi-hide-messages](https://github.com/MasuRii/pi-hide-messages) — Hide older TUI chat history while preserving full session context
- [pi-context-injector](https://github.com/MasuRii/pi-context-injector) — Inject compact project context into first-turn and compaction prompts
- [pi-tool-display](https://github.com/MasuRii/pi-tool-display) — Compact tool rendering and diff visualization
- [pi-rtk-optimizer](https://github.com/MasuRii/pi-rtk-optimizer) — RTK command rewriting and output compaction

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

[MIT](LICENSE) © MasuRii
