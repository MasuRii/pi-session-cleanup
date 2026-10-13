import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  clearScheduledSessionDeletionForQuit,
  flushScheduledSessionDeletionForQuit,
  runArmedQuitDeletion,
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
  const before = process.listenerCount("exit");

  scheduleSessionDeletionForQuit(undefined);
  await flushScheduledSessionDeletionForQuit(ctx);

  assert.equal(process.listenerCount("exit"), before);
  assert.deepEqual(notifications, []);
});

test("flushScheduledSessionDeletionForQuit deletes only after process exit", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-quit-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(sessionPath, "{}\n", "utf8");
    const { ctx, notifications } = createShutdownContext();
    const before = process.listenerCount("exit");

    scheduleSessionDeletionForQuit(sessionPath);
    await flushScheduledSessionDeletionForQuit(ctx);
    appendFileSync(
      sessionPath,
      '{"type":"custom","customType":"plan-mode-state","data":{"enabled":false}}\n',
      "utf8",
    );
    await flushScheduledSessionDeletionForQuit(ctx);

    assert.equal(existsSync(sessionPath), true);
    assert.equal(process.listenerCount("exit"), before + 1);

    runArmedQuitDeletion();
    runArmedQuitDeletion();

    assert.equal(existsSync(sessionPath), false);
    assert.equal(process.listenerCount("exit"), before);
    assert.deepEqual(notifications, []);
  } finally {
    clearScheduledSessionDeletionForQuit();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("clearScheduledSessionDeletionForQuit cancels an armed process-exit deletion", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-quit-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(sessionPath, "{}\n", "utf8");
    const { ctx } = createShutdownContext();

    scheduleSessionDeletionForQuit(sessionPath);
    await flushScheduledSessionDeletionForQuit(ctx);
    clearScheduledSessionDeletionForQuit();
    runArmedQuitDeletion();

    assert.equal(existsSync(sessionPath), true);
  } finally {
    clearScheduledSessionDeletionForQuit();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("non-quit shutdown does not consume a scheduled quit deletion", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-quit-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(sessionPath, "{}\n", "utf8");
    const { ctx } = createShutdownContext();

    scheduleSessionDeletionForQuit(sessionPath);
    await flushScheduledSessionDeletionForQuit(ctx, { reason: "new" });
    assert.equal(existsSync(sessionPath), true);

    await flushScheduledSessionDeletionForQuit(ctx, { reason: "quit" });
    runArmedQuitDeletion();

    assert.equal(existsSync(sessionPath), false);
  } finally {
    clearScheduledSessionDeletionForQuit();
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("process-exit deletion reports a synchronous delete failure", async () => {
  const { ctx } = createShutdownContext();
  const chunks: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    scheduleSessionDeletionForQuit("session.jsonl");
    await flushScheduledSessionDeletionForQuit(ctx, {
      deleteSync: () => ({ ok: false, method: "unlink", error: "disk full" }),
    });
    runArmedQuitDeletion();

    assert.equal(chunks.some((chunk) => chunk.includes("disk full")), true);
  } finally {
    process.stderr.write = originalWrite;
    clearScheduledSessionDeletionForQuit();
  }
});
