import type { PickerIcons } from "./icons.js";

export interface LegendContent {
  lines: string[];
}

export function buildLegendContent(_icons: PickerIcons, _maxWidth: number): LegendContent {
  return {
    lines: [
      "NAV: [↑/↓/j/k] Move  [PgUp/PgDn] Page",
      "SEL: [Space] Toggle  [a] Select All",
      "ACT: [Enter] Delete  [r] Refresh  [Esc/q] Cancel",
    ],
  };
}
