# Changelog

## 1.1.3 - 2026-06-01

- Deferred command module loading for `/session-cleanup` and `/nix` handlers while preserving inline completions.
- Widened Pi coding-agent and Pi TUI peer dependency ranges to include `^0.77.0 || ^0.78.0`.

## 1.1.2 - 2026-05-26

- Widened peer dependency ranges to `^0.74.0 || ^0.75.0`.

## 1.1.1 - 2026-05-22

- Sends session files to available desktop trash providers (`trash`, `trash-put`, `gio trash`, or `kioclient move`) before permanent deletion.
- Warns `/nix quit` users when trash providers are unavailable and requires confirmation before permanent current-session deletion fallback.
- Added coverage for trash-provider selection and `/nix` deletion warning behavior.

## 1.1.0 - 2026-05-04

- Added `/nix quit` for confirmed current-session deletion during graceful Pi shutdown
- Added `/nix agent [name]` for starting fresh sessions with persisted target-agent metadata
- Added `/nix` argument completions, explicit help output, and safer compatibility warnings for unsupported Pi builds
- Documented destructive `/nix` safeguards and added targeted release-readiness coverage for the new session flows

## 1.0.0 - 2026-03-05

- Renamed extension from its previous package name to `pi-session-cleanup`
- Renamed primary command to `/session-cleanup`
- Added a deprecated legacy alias for backward compatibility
- Refactored command/picker module names for clarity
- Upgraded custom picker UI with bordered modal layout, title/status/help lines, and responsive overlay sizing
- Added production-ready package metadata and README
