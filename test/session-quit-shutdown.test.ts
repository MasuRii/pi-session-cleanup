import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  flushScheduledSessionDeletionForQuit,
  scheduleSessionDeletionForQuit,
} from "../src/session-quit-shutdown.js";

function createShutdownContext() {
  const notifications: Array<{ message: string; type?: string }> = [];

  return {
    notifications,
    ctx: {
      ui: {
        notify: (message: string, type?: "info" | "warning" | "error") => {
          notifications.push({ message, type });
        },
      },
    } as never,
  };
}

test("flushScheduledSessionDeletionForQuit ignores missing scheduled session files", async () => {
  const { ctx, notifications } = createShutdownContext();

  scheduleSessionDeletionForQuit(undefined);
  await flushScheduledSessionDeletionForQuit(ctx);

  assert.deepEqual(notifications, []);
});

test("flushScheduledSessionDeletionForQuit deletes a scheduled session file once", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-quit-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(sessionPath, "{}\n", "utf8");
    const { ctx, notifications } = createShutdownContext();

    scheduleSessionDeletionForQuit(sessionPath);
    await flushScheduledSessionDeletionForQuit(ctx);
    await flushScheduledSessionDeletionForQuit(ctx);

    assert.equal(existsSync(sessionPath), false);
    assert.deepEqual(notifications, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
