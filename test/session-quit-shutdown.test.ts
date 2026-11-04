import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clearScheduledSessionDeletionForQuit,
  flushScheduledSessionDeletionForQuit,
  scheduleSessionDeletionForQuit,
} from "../src/session-quit-shutdown.js";

function createShutdownContext(sessionFile?: string) {
  const notifications: Array<{ message: string; type?: string }> = [];

  return {
    notifications,
    ctx: {
      sessionManager: { getSessionFile: () => sessionFile },
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
    const { ctx, notifications } = createShutdownContext(sessionPath);

    scheduleSessionDeletionForQuit(sessionPath);
    await flushScheduledSessionDeletionForQuit(ctx);
    await flushScheduledSessionDeletionForQuit(ctx);

    assert.equal(existsSync(sessionPath), false);
    assert.deepEqual(notifications, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("overlapping quit requests are consumed only by their own sessions", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-overlap-"));
  const first = join(tempDir, "first.jsonl");
  const second = join(tempDir, "second.jsonl");
  const unrelated = join(tempDir, "unrelated.jsonl");
  try {
    for (const path of [first, second, unrelated]) writeFileSync(path, "{}\n", "utf8");
    scheduleSessionDeletionForQuit(first);
    scheduleSessionDeletionForQuit(second);
    await flushScheduledSessionDeletionForQuit(createShutdownContext(unrelated).ctx);
    await flushScheduledSessionDeletionForQuit(createShutdownContext().ctx);
    assert.equal(existsSync(first), true);
    assert.equal(existsSync(second), true);
    await flushScheduledSessionDeletionForQuit(createShutdownContext(first).ctx);
    assert.equal(existsSync(first), false);
    assert.equal(existsSync(second), true);
    assert.equal(existsSync(unrelated), true);
    await flushScheduledSessionDeletionForQuit(createShutdownContext(second).ctx);
    assert.equal(existsSync(second), false);
  } finally {
    clearScheduledSessionDeletionForQuit(first);
    clearScheduledSessionDeletionForQuit(second);
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("clearing one quit request preserves the other session's request", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-clear-"));
  const first = join(tempDir, "first.jsonl");
  const second = join(tempDir, "second.jsonl");
  try {
    for (const path of [first, second]) writeFileSync(path, "{}\n", "utf8");
    scheduleSessionDeletionForQuit(first);
    scheduleSessionDeletionForQuit(second);
    clearScheduledSessionDeletionForQuit(first);
    clearScheduledSessionDeletionForQuit(undefined);
    scheduleSessionDeletionForQuit(undefined);
    await flushScheduledSessionDeletionForQuit(createShutdownContext(first).ctx);
    assert.equal(existsSync(first), true);
    await flushScheduledSessionDeletionForQuit(createShutdownContext(second).ctx);
    assert.equal(existsSync(second), false);
  } finally {
    clearScheduledSessionDeletionForQuit(first);
    clearScheduledSessionDeletionForQuit(second);
    rmSync(tempDir, { recursive: true, force: true });
  }
});
