import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  extractResponsibleAgentNameFromContent,
  resolveResponsibleAgentName,
} from "../src/session-agent.js";

test("extractResponsibleAgentNameFromContent returns the most recent valid active agent", () => {
  const content = [
    JSON.stringify({ type: "message", role: "user", content: "hello" }),
    "{not-json}",
    JSON.stringify({ type: "custom", customType: "active_agent", data: { name: "code" } }),
    JSON.stringify({ type: "custom", customType: "active_agent", data: { name: "  ui  " } }),
  ].join("\n");

  assert.equal(extractResponsibleAgentNameFromContent(content), "ui");
});

test("resolveResponsibleAgentName falls back to null when metadata is missing or malformed", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-agent-"));

  try {
    const sessionPath = join(tempDir, "session.jsonl");
    writeFileSync(
      sessionPath,
      [
        JSON.stringify({ type: "custom", customType: "active_agent", data: { name: "" } }),
        JSON.stringify({ type: "custom", customType: "other", data: { name: "code" } }),
        "{bad-json}",
      ].join("\n"),
      "utf8",
    );

    assert.equal(await resolveResponsibleAgentName(sessionPath), null);
    assert.equal(await resolveResponsibleAgentName(join(tempDir, "missing.jsonl")), null);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
