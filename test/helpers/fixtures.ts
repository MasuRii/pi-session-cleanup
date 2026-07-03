import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface AgentTestFixture {
  tempDir: string;
  runtimeDir: string;
  cwd: string;
  agentsDir: string;
  cleanup: () => void;
}

export function createAgentTestFixture(prefix: string): AgentTestFixture {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));

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

  return {
    tempDir,
    runtimeDir,
    cwd,
    agentsDir,
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
