import assert from "node:assert/strict";
import test from "node:test";

import { appendActiveAgentSessionEntry } from "../src/session-entry.js";

test("appendActiveAgentSessionEntry writes active-agent custom metadata", () => {
  const appended: Array<{ customType: string; data: unknown }> = [];
  const sessionManager = {
    appendCustomEntry: (customType: string, data?: unknown): string => {
      appended.push({ customType, data });
      return "entry-id";
    },
  };

  appendActiveAgentSessionEntry(sessionManager as never, "code");

  assert.deepEqual(appended, [
    {
      customType: "active_agent",
      data: { name: "code" },
    },
  ]);
});

test("appendActiveAgentSessionEntry reports incompatible Pi builds", () => {
  let thrown: unknown;

  try {
    appendActiveAgentSessionEntry({} as never, "code");
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof Error, "expected missing appendCustomEntry to throw");
  assert.ok(
    thrown.message.includes("sessionManager.appendCustomEntry"),
    "expected actionable compatibility message",
  );
});
