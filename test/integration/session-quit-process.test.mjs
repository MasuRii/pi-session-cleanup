import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const piEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const piCli = fileURLToPath(new URL("cli.js", piEntry));
const extension = join(root, ".test-dist/index.js");
const lateWriter = join(root, "test/fixtures/late-shutdown-writer.mjs");

function seedSession(path, cwd, id) {
  // An opened session is already flushed, so Pi's real appendEntry persists even
  // without contacting a model. Version 3 is the format used by Pi 0.80.3.
  writeFileSync(path, `${JSON.stringify({
    type: "session", version: 3, id, timestamp: new Date().toISOString(), cwd,
  })}\n`);
}

async function withPi(run, { failDelete = false, quits = false, confirmed = true } = {}) {
  assert.ok(existsSync(extension), "Compile the extension with npm test first");
  const dir = mkdtempSync(join(tmpdir(), "pi-cleanup-process-"));
  const sessionFile = join(dir, "original.jsonl");
  const targetFile = join(dir, "target.jsonl");
  const traceFile = join(dir, "shutdown.jsonl");
  const emptyPath = join(dir, "empty-bin");
  mkdirSync(emptyPath);
  seedSession(sessionFile, dir, "11111111-1111-4111-8111-111111111111");
  seedSession(targetFile, dir, "22222222-2222-4222-8222-222222222222");
  // Isolate settings, auth, resource discovery and trash providers from the host.
  const agentDir = join(dir, "agent");
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "settings.json"), JSON.stringify({ packages: [], extensions: [] }));
  const child = spawn(process.execPath, [piCli,
    "--mode", "rpc", "--provider", "openai", "--model", "gpt-4o-mini",
    "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-context-files",
    "--no-themes", "--no-tools", "--session", sessionFile, "--session-dir", dir,
    "-e", extension, "-e", lateWriter,
  ], {
    cwd: dir,
    env: {
      ...process.env, PI_CODING_AGENT_DIR: agentDir, PATH: emptyPath,
      CLEANUP_TEST_TRACE: traceFile, CLEANUP_TEST_FAIL_DELETE: failDelete ? "1" : "0",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  const messages = [];
  const pending = new Map();
  let nextId = 0;
  let confirmationCount = 0;
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let message;
    try { message = JSON.parse(line); }
    catch { messages.push({ invalidOutput: line }); return; }
    messages.push(message);
    if (message.type === "extension_ui_request" && message.method === "confirm") {
      confirmationCount++;
      send({ type: "extension_ui_response", id: message.id, confirmed });
    }
    if (message.type === "response" && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.success) resolve(message.data);
      else reject(new Error(JSON.stringify(message)));
    }
  });
  const closed = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => {
      for (const waiter of pending.values()) waiter.reject(new Error(`Pi exited: ${code}/${signal}\n${stderr}`));
      pending.clear();
      resolve({ code, signal });
    });
  });
  // A hang or crash must fail, never masquerade as successful cleanup.
  const timeout = setTimeout(() => child.kill("SIGKILL"), 20_000);
  const request = (type, fields = {}) => new Promise((resolve, reject) => {
    const id = `test-${++nextId}`;
    pending.set(id, { resolve, reject });
    send({ type, id, ...fields });
  });
  try {
    await request("get_state"); // Also proves startup and extension loading succeeded.
    await run({ request, sessionFile, targetFile });
    // Pi 0.80.3 runs RPC prompts asynchronously and checks ctx.shutdown()'s flag
    // after the next RPC command. Drive that check with a harmless state request.
    // Do not also send EOF: it could race the in-flight shutdown and hard-exit.
    if (quits) await request("get_state");
    else child.stdin.end();
    const result = await closed;
    assert.deepEqual(result, { code: 0, signal: null }, stderr);
    assert.deepEqual(messages.filter((m) => m.type === "extension_error" || m.type === "agent_start" || m.invalidOutput), [],
      `Extension error or unexpected model invocation: ${JSON.stringify(messages)}\n${stderr}`);
    const trace = readFileSync(traceFile, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    return { sessionFile, targetFile, trace, stderr, confirmationCount,
      originalExists: existsSync(sessionFile), targetExists: existsSync(targetFile),
      originalContents: existsSync(sessionFile) && !failDelete ? readFileSync(sessionFile, "utf8") : undefined };
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await closed;
    lines.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

test("real Pi /nix quit deletes after a later async shutdown appendEntry", async () => {
  const result = await withPi(async ({ request }) => {
    await request("prompt", { message: "/nix quit" });
  }, { quits: true });
  assert.equal(result.confirmationCount, 1);
  assert.deepEqual(result.trace, [{ reason: "quit", sessionFile: result.sessionFile,
    existedBeforeAppend: true, persisted: true }]);
  assert.equal(result.originalExists, false);
  assert.equal(result.targetExists, true);
  assert.equal(result.stderr, "");
});

test("real Pi exit reports a real filesystem deletion failure on captured stderr", async () => {
  const result = await withPi(async ({ request }) => {
    await request("prompt", { message: "/nix quit" });
  }, { failDelete: true, quits: true });
  assert.equal(result.confirmationCount, 1);
  assert.equal(result.trace.length, 1);
  assert.equal(result.trace[0].persisted, true);
  assert.equal(result.originalExists, true);
  assert.equal(result.targetExists, true);
  assert.match(result.stderr, /Failed to delete the current session during shutdown:.*(?:EISDIR|EPERM)/);
  assert.ok(result.stderr.includes(result.sessionFile));
  assert.equal(result.stderr.split("Failed to delete the current session during shutdown:").length - 1, 1);
});

test("ordinary Pi EOF shutdown preserves the session and the later append", async () => {
  const result = await withPi(async () => {});
  assert.equal(result.confirmationCount, 0);
  assert.deepEqual(result.trace, [{ reason: "quit", sessionFile: result.sessionFile,
    existedBeforeAppend: true, persisted: true }]);
  assert.equal(result.originalExists, true);
  assert.ok(result.originalContents.includes('"customType":"late-shutdown-writer"'));
  assert.equal(result.stderr, "");
});

test("cancelled /nix quit preserves the session on subsequent ordinary exit", async () => {
  const result = await withPi(async ({ request }) => {
    await request("prompt", { message: "/nix quit" });
    await request("get_state");
  }, { confirmed: false });
  assert.equal(result.confirmationCount, 1);
  assert.deepEqual(result.trace, [{ reason: "quit", sessionFile: result.sessionFile,
    existedBeforeAppend: true, persisted: true }]);
  assert.equal(result.originalExists, true);
  assert.equal(result.stderr, "");
});

test("ordinary Pi new_session preserves the previous session through process exit", async () => {
  const result = await withPi(async ({ request }) => {
    const switched = await request("new_session");
    assert.equal(switched.cancelled, false);
  });
  assert.equal(result.trace[0].reason, "new");
  assert.equal(result.trace[0].sessionFile, result.sessionFile);
  assert.equal(result.trace[0].persisted, true);
  assert.equal(result.trace[1].reason, "quit");
  assert.notEqual(result.trace[1].sessionFile, result.sessionFile);
  assert.equal(result.originalExists, true);
  assert.equal(result.stderr, "");
});

test("ordinary Pi switch_session preserves both persisted sessions", async () => {
  const result = await withPi(async ({ request, targetFile }) => {
    const switched = await request("switch_session", { sessionPath: targetFile });
    assert.equal(switched.cancelled, false);
  });
  assert.deepEqual(result.trace, [
    { reason: "resume", sessionFile: result.sessionFile, existedBeforeAppend: true, persisted: true },
    { reason: "quit", sessionFile: result.targetFile, existedBeforeAppend: true, persisted: true },
  ]);
  assert.equal(result.originalExists, true);
  assert.equal(result.targetExists, true);
  assert.equal(result.stderr, "");
});

test("/nix fresh still switches before deleting, and does not arm deletion on later exit", async () => {
  const result = await withPi(async ({ request, sessionFile, targetFile }) => {
    await request("prompt", { message: "/nix" });
    assert.equal(existsSync(sessionFile), false);
    await request("switch_session", { sessionPath: targetFile });
  });
  assert.equal(result.confirmationCount, 1);
  assert.equal(result.trace[0].reason, "new");
  assert.equal(result.trace[0].sessionFile, result.sessionFile);
  assert.equal(result.trace[0].existedBeforeAppend, true);
  assert.equal(result.trace[0].persisted, true);
  assert.equal(result.trace.at(-1).sessionFile, result.targetFile);
  assert.equal(result.trace.at(-1).persisted, true);
  assert.equal(result.originalExists, false);
  assert.equal(result.targetExists, true);
  assert.equal(result.stderr, "");
});
