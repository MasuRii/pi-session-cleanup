import assert from "node:assert/strict";
import test from "node:test";

import { deleteSessionFile } from "../src/session-delete.js";

function spawnResult(overrides: { status?: number | null; stderr?: string; error?: Error } = {}) {
  return {
    stderr: "",
    status: 1,
    ...overrides,
  };
}

test("falls back through Linux trash providers before unlink", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const result = await deleteSessionFile("session.json", {
    spawn: async (command: string, args: readonly string[]) => {
      calls.push({ command, args: [...args] });
      return spawnResult({ status: command === "gio" ? 0 : 1 });
    },
    existsSync: () => true,
    unlink: async () => {
      throw new Error("unlink should not run after trash succeeds");
    },
  });

  assert.deepEqual(result, { ok: true, method: "trash" });
  assert.deepEqual(calls.map((call) => call.command), ["trash", "trash-put", "gio"]);
  assert.deepEqual(calls[2], { command: "gio", args: ["trash", "session.json"] });
});

test("preserves dash-leading path safety for trash providers", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  await deleteSessionFile("-dangerous.json", {
    spawn: async (command: string, args: readonly string[]) => {
      calls.push({ command, args: [...args] });
      return spawnResult({ status: 0 });
    },
    existsSync: () => true,
  });

  assert.deepEqual(calls[0], { command: "trash", args: ["--", "-dangerous.json"] });
});

test("uses unlink when trash providers are missing", async () => {
  const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  let unlinkedPath: string | undefined;

  const result = await deleteSessionFile("session.json", {
    spawn: async () => spawnResult({ error: missing, status: null }),
    existsSync: () => true,
    unlink: async (path: string) => {
      unlinkedPath = path;
    },
  });

  assert.deepEqual(result, { ok: true, method: "unlink" });
  assert.equal(unlinkedPath, "session.json");
});

test("passes strict timeout options to async trash providers without settling early", async () => {
  let finishSpawn: ((value: { status: number; stderr: string }) => void) | undefined;
  let settled = false;
  const calls: Array<{ command: string; timeout: number; maxStderrBytes: number }> = [];
  const deletePromise = deleteSessionFile("session.json", {
    spawn: (command, _args, options) => {
      calls.push({ command, timeout: options.timeout, maxStderrBytes: options.maxStderrBytes });
      return new Promise((resolve) => {
        finishSpawn = resolve;
      });
    },
    existsSync: () => true,
    unlink: async () => {
      throw new Error("unlink should not run while trash is pending");
    },
  });
  deletePromise.then(() => {
    settled = true;
  });

  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual(calls, [{ command: "trash", timeout: 5_000, maxStderrBytes: 64 * 1024 }]);

  finishSpawn?.({ status: 0, stderr: "" });
  assert.deepEqual(await deletePromise, { ok: true, method: "trash" });
});


test("returns final unlink failure with trash provider hints", async () => {
  const result = await deleteSessionFile("session.json", {
    spawn: async (command: string) => spawnResult({ status: 1, stderr: `${command} failed` }),
    existsSync: () => true,
    unlink: async () => {
      throw new Error("permission denied");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.method, "unlink");
  assert.match(result.error, /permission denied/);
  assert.match(result.error, /trash: trash failed/);
  assert.match(result.error, /gio trash: gio failed/);
});
