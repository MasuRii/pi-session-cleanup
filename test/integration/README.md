# Process shutdown regression tests

Run `npm ci` and `npm test` (all tests), or `npm run test:integration` (only the
process tests). Node 20+ and the existing Pi development dependency are required.
No provider credentials, model requests, PTY library, or global Pi install are
needed. A missing Pi dependency is an error, not a skipped test.

Each test starts the installed Pi CLI in RPC mode with the compiled cleanup
extension followed by `test/fixtures/late-shutdown-writer.mjs`. Commands and
confirmation responses travel through Pi's JSONL protocol. After `/nix quit`, a
state request drives RPC's pending-shutdown check; EOF is used only for ordinary
exit. The fixture awaits briefly in `session_shutdown`, calls the real
`pi.appendEntry()`, and records
whether the entry reached disk. Pi emits the events and calls `process.exit()`;
the tests never invoke the deletion helper, synthesize an exit event, or replace
stderr. The parent waits for child `close` and checks files and captured stderr.

An isolated agent directory and explicit extension paths prevent user packages
from loading. An empty PATH disables host trash utilities so the tests exercise
the real unlink fallback. For the failure case, the later handler replaces the
session path with a nonempty directory, causing unlink to fail even as root.
Temporary sessions and fixtures are removed after every case, including timeout
or assertion failures. A nonzero exit, signal, extension error, model invocation,
or 20-second timeout fails the test.

Coverage includes `/nix quit`, failed exit-time deletion, ordinary EOF shutdown,
cancelled `/nix quit`, ordinary new-session and resume transitions, and `/nix`
fresh-session deletion followed by normal exit. The opened seed files use Pi's
session header format; no hand-written persistence substitute is used by the
late writer.

These tests exercise the real Pi RPC shutdown path and Node exit listeners. They
do not exercise interactive TUI keyboard input, terminal teardown, actual trash
utilities, or other supported Pi versions. Those remain separate validation
scopes.

## Verified run

On October 13, 2026, `npm run check` passed on Linux with Node 24.19.0 and Pi
0.80.3: the build, 28 unit tests, and all 7 process tests completed without
failures or skips. The parent observed successful deletion after the late append
and captured the real exit-time unlink error on stderr.

A local mutation replaced exit-listener registration with immediate deletion
inside `session_shutdown`. The quit regression failed: the late writer found
the original file absent and recreated it through `pi.appendEntry()`. The
mutation was restored before the full check. No production source changes were
needed for these tests.
