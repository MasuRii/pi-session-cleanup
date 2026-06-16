import assert from "node:assert/strict";
import test from "node:test";

import { extractResponsibleAgentNameFromContent } from "../src/session-agent.js";

test("extractResponsibleAgentNameFromContent falls back to the previous valid agent when the latest entry is malformed", () => {
  const content = [
    JSON.stringify({ type: "custom", customType: "active_agent", data: { name: "code" } }),
    JSON.stringify({ type: "custom", customType: "active_agent", data: { name: "   " } }),
  ].join("\n");

  assert.equal(extractResponsibleAgentNameFromContent(content), "code");
});
