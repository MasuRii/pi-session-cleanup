import assert from "node:assert/strict";
import test from "node:test";

import { resolvePickerIconsForContext } from "../src/ui/icons.js";
import { buildLegendContent } from "../src/ui/legend.js";

function visibleWidth(text: string): number {
  return [...text].length;
}

test("legend content matches the requested grouped footer controls", () => {
  const { icons } = resolvePickerIconsForContext("fallback", {
    platform: "linux",
    env: {},
    pathExists: () => false,
    readTextFile: () => null,
  });
  const legend = buildLegendContent(icons, 80);

  assert.deepEqual(legend.lines, [
    "NAV: [↑/↓/j/k] Move  [PgUp/PgDn] Page",
    "SEL: [Space] Toggle  [a] Select All",
    "ACT: [Enter] Delete  [r] Refresh  [Esc/q] Cancel",
  ]);

  for (const line of legend.lines) {
    assert.ok(visibleWidth(line) <= 80, `legend line exceeded width budget: ${line}`);
  }
});
