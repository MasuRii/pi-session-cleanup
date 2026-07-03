import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildAgentSelectionMenu,
  discoverSelectableAgents,
} from "../src/agent-target.js";
import { withEnv } from "./helpers/env.js";

test("buildAgentSelectionMenu marks the current agent and preserves labels", () => {
  const menu = buildAgentSelectionMenu(
    [
      { name: "code", description: "General coding", mode: "primary" },
      { name: "review", description: "Reviews changes", mode: "subagent" },
    ],
    "review",
  );

  assert.deepEqual(menu.labels, [
    "○ code [primary] — General coding",
    "● review [subagent] — Reviews changes",
  ]);
  assert.equal(menu.valueByLabel.get(menu.labels[1] ?? ""), "review");
});

test("discoverSelectableAgents reads nearest project agents and lets them override agent-dir agents", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-session-cleanup-agent-target-"));

  try {
    const runtimeDir = join(tempDir, "runtime");
    const runtimeAgentsDir = join(runtimeDir, "agents");
    const projectDir = join(tempDir, "project");
    const nestedCwd = join(projectDir, "packages", "demo");
    const projectAgentsDir = join(projectDir, ".pi", "agents");

    mkdirSync(runtimeAgentsDir, { recursive: true });
    mkdirSync(projectAgentsDir, { recursive: true });
    mkdirSync(nestedCwd, { recursive: true });

    writeFileSync(
      join(runtimeAgentsDir, "release-agent.md"),
      "---\nname: release-agent\ndescription: Runtime copy\nmode: primary\n---\n",
      "utf8",
    );
    writeFileSync(
      join(projectAgentsDir, "release-agent.md"),
      "---\nname: release-agent\ndescription: Project copy\nmode: subagent\n---\n",
      "utf8",
    );

    await withEnv({ PI_CODING_AGENT_DIR: runtimeDir }, () => {
      const agents = discoverSelectableAgents(nestedCwd);
      const releaseAgent = agents.find((agent) => agent.name === "release-agent");

      assert.ok(releaseAgent, "expected project agent to be discovered");
      assert.equal(releaseAgent.description, "Project copy");
      assert.equal(releaseAgent.mode, "subagent");
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
