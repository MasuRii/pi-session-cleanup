import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";

import {
  getSessionNixArgumentCompletions,
  handleSessionNixCommand,
} from "../src/session-nix-command.js";

interface MockCommandContextOptions {
  cwd?: string;
  entries?: unknown[];
  sessionFile?: string;
  hasUI?: boolean;
  confirmResult?: boolean;
  newSessionCancelled?: boolean;
  shutdown?: () => Promise<void> | void;
}

interface NewSessionOptions {
  setup?: (sessionManager: SessionManager) => Promise<void> | void;
}

function createCommandContext(options: MockCommandContextOptions = {}) {
  const notifications: Array<{ message: string; type?: string }> = [];
  const confirmations: Array<{ title: string; message: string }> = [];
  const appended: Array<{ customType: string; data: unknown }> = [];
  let newSessionCalls = 0;

  const setupSessionManager = {
    appendCustomEntry: (customType: string, data?: unknown): string => {
      appended.push({ customType, data });
      return "entry-id";
    },
  } as SessionManager;

  const ctx = {
    hasUI: options.hasUI ?? true,
    cwd: options.cwd ?? process.cwd(),
    sessionManager: {
      getSessionFile: () => options.sessionFile,
      getEntries: () => options.entries ?? [],
    },
    ui: {
      confirm: async (title: string, message: string): Promise<boolean> => {
        confirmations.push({ title, message });
        return options.confirmResult ?? true;
      },
      notify: (message: string, type?: "info" | "warning" | "error") => {
        notifications.push({ message, type });
      },
      select: async (): Promise<string | undefined> => undefined,
      custom: async (): Promise<void> => undefined,
    },
    newSession: async (newSessionOptions?: NewSessionOptions): Promise<{ cancelled: boolean }> => {
      newSessionCalls += 1;
      await newSessionOptions?.setup?.(setupSessionManager);
      return { cancelled: options.newSessionCancelled ?? false };
    },
    reload: async (): Promise<void> => undefined,
    getSystemPrompt: () => "",
    shutdown: options.shutdown,
  } as unknown as ExtensionCommandContext;

  return {
    ctx,
    notifications,
    confirmations,
    appended,
    get newSessionCalls() {
      return newSessionCalls;
    },
  };
}

async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("getSessionNixArgumentCompletions returns safe /nix subcommands", () => {
  assert.deepEqual(getSessionNixArgumentCompletions(""), [
    {
      value: "quit",
      label: "quit",
      description: "Delete the current session and quit Pi immediately",
    },
    {
      value: "agent",
      label: "agent",
      description: "Start a fresh session with a selected target agent",
    },
    {
      value: "help",
      label: "help",
      description: "Show usage",
    },
  ]);
  assert.deepEqual(getSessionNixArgumentCompletions("ag"), [
    {
      value: "agent",
      label: "agent",
      description: "Start a fresh session with a selected target agent",
    },
  ]);
  assert.equal(getSessionNixArgumentCompletions("unknown"), null);
});

test("handleSessionNixCommand starts fresh sessions only after confirmation and deletes the old file", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-nix-fresh-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(sessionPath, "{}\n", "utf8");
    const mock = createCommandContext({ sessionFile: sessionPath });

    await handleSessionNixCommand("", mock.ctx);

    assert.equal(mock.newSessionCalls, 1);
    assert.equal(mock.confirmations[0]?.title, "Start fresh and delete current session");
    assert.equal(existsSync(sessionPath), false);
    assert.deepEqual(mock.notifications, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("handleSessionNixCommand warns when fresh-session deletion fails after switching", async () => {
  const sessionPath = "session.jsonl";
  const mock = createCommandContext({ sessionFile: sessionPath });
  let deleteCalls = 0;

  await handleSessionNixCommand("", mock.ctx, {
    deleteSessionFile: async (path: string) => {
      deleteCalls += 1;
      assert.equal(path, sessionPath);
      return { ok: false, method: "unlink", error: "permission denied" };
    },
  });

  assert.equal(mock.newSessionCalls, 1);
  assert.equal(deleteCalls, 1);
  assert.deepEqual(mock.notifications, [
    {
      message: "Failed to delete the previous session after starting the new session: permission denied",
      type: "warning",
    },
  ]);
});

test("handleSessionNixCommand refuses /nix quit when graceful shutdown is unavailable", async () => {
  const mock = createCommandContext({ sessionFile: "session.jsonl" });

  await handleSessionNixCommand("quit", mock.ctx);

  assert.equal(mock.confirmations[0]?.title, "Delete current session and quit Pi");
  assert.equal(mock.notifications.length, 1);
  assert.equal(mock.notifications[0]?.type, "warning");
  assert.ok(
    mock.notifications[0]?.message.includes("Graceful shutdown is unavailable"),
    "expected shutdown compatibility warning",
  );
});

test("handleSessionNixCommand warns when target-agent session deletion fails after switching", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-nix-agent-delete-fail-"));

  try {
    const runtimeDir = join(tempDir, "runtime");
    const cwd = join(tempDir, "workspace");
    const agentsDir = join(cwd, ".pi", "agents");
    const sessionPath = join(tempDir, "session.jsonl");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "release-agent.md"),
      "---\nname: release-agent\ndescription: Release readiness agent\nmode: subagent\n---\n",
      "utf8",
    );

    const mock = createCommandContext({ cwd, sessionFile: sessionPath });
    let deleteCalls = 0;

    await withEnv({ PI_CODING_AGENT_DIR: runtimeDir }, async () => {
      await handleSessionNixCommand("agent release-agent", mock.ctx, {
        deleteSessionFile: async (path: string) => {
          deleteCalls += 1;
          assert.equal(path, sessionPath);
          return { ok: false, method: "unlink", error: "trash and unlink failed" };
        },
      });
    });

    assert.equal(mock.newSessionCalls, 1);
    assert.equal(deleteCalls, 1);
    assert.deepEqual(mock.notifications, [
      {
        message: "Failed to delete the previous session after starting the new session: trash and unlink failed",
        type: "warning",
      },
    ]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("handleSessionNixCommand starts an explicit target-agent session with active-agent metadata", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-nix-agent-"));

  try {
    const runtimeDir = join(tempDir, "runtime");
    const cwd = join(tempDir, "workspace");
    const agentsDir = join(cwd, ".pi", "agents");
    mkdirSync(agentsDir, { recursive: true });
    mkdirSync(runtimeDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "release-agent.md"),
      "---\nname: release-agent\ndescription: Release readiness agent\nmode: subagent\n---\n",
      "utf8",
    );

    const mock = createCommandContext({
      cwd,
      entries: [
        { type: "custom", customType: "active_agent", data: { name: "code" } },
      ],
    });

    await withEnv({ PI_CODING_AGENT_DIR: runtimeDir }, async () => {
      await handleSessionNixCommand("agent release-agent", mock.ctx);
    });

    assert.equal(mock.newSessionCalls, 1);
    assert.equal(mock.confirmations[0]?.title, "Start a new 'release-agent' session");
    assert.deepEqual(mock.appended, [
      {
        customType: "active_agent",
        data: { name: "release-agent" },
      },
    ]);
    assert.deepEqual(mock.notifications, []);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
