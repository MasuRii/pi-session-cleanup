import assert from "node:assert/strict";
import test from "node:test";

import type { SessionInfo } from "@earendil-works/pi-coding-agent";

import { sortSessionsNewestFirst } from "../src/session-sort.js";

test("sortSessionsNewestFirst ignores impossible calendar dates in session filenames", () => {
  const sorted = sortSessionsNewestFirst([
    {
      id: "invalid-calendar-date",
      path: "session-2026-02-31.jsonl",
      name: "Invalid calendar date",
      created: undefined,
      modified: undefined,
    } as unknown as SessionInfo,
    {
      id: "valid-calendar-date",
      path: "session-2026-02-28.jsonl",
      name: "Valid calendar date",
      created: undefined,
      modified: undefined,
    } as unknown as SessionInfo,
  ]);

  assert.equal(sorted[0]?.id, "valid-calendar-date");
  assert.equal(sorted[1]?.id, "invalid-calendar-date");
});
