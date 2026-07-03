import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export interface ThemeLike {
  fg?: unknown;
  bold?: unknown;
}

export interface OverlayOptions {
  anchor: "center";
  width: number;
  maxHeight: number;
  margin: number;
}

export interface OverlaySizePreferences {
  /** Preferred widths at terminal-width breakpoints. Defaults to session-cleanup scale. */
  preferredWidths?: ReadonlyArray<{ minWidth: number; width: number }>;
  /** Fallback width when no breakpoint matches. */
  defaultWidth?: number;
  /** Fraction of terminal height to use for the overlay. Defaults to 0.86. */
  heightFraction?: number;
  /** Minimum height floor. Defaults to 12. */
  minHeight?: number;
}

const DEFAULT_PREFERRED_WIDTHS: ReadonlyArray<{ minWidth: number; width: number }> = [
  { minWidth: 160, width: 118 },
  { minWidth: 140, width: 110 },
  { minWidth: 120, width: 100 },
];

const DEFAULT_WIDTH = 92;
const DEFAULT_HEIGHT_FRACTION = 0.86;
const DEFAULT_MIN_HEIGHT = 12;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function fitLine(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width), "…", true);
}

export function formatTheme(theme: ThemeLike, color: string, text: string): string {
  try {
    if (typeof theme.fg === "function") {
      const format = theme.fg as (resolvedColor: string, value: string) => string;
      return format(color, text);
    }
  } catch {
    // Plain text rendering when the theme formatter throws.
    return text;
  }

  return text;
}

export function formatBold(theme: ThemeLike, text: string): string {
  try {
    if (typeof theme.bold === "function") {
      const format = theme.bold as (value: string) => string;
      return format(text);
    }
  } catch {
    // Plain text rendering when the theme formatter throws.
    return text;
  }

  return text;
}

export function frameTop(width: number): string {
  return `╭${"─".repeat(width)}╮`;
}

export function frameDivider(width: number): string {
  return `├${"─".repeat(width)}┤`;
}

export function frameBottom(width: number): string {
  return `╰${"─".repeat(width)}╯`;
}

export function frameLine(content: string, width: number): string {
  const clipped = fitLine(content, width);
  const padded = clipped.padEnd(width, " ");
  return `│${padded}│`;
}

function readTerminalColumns(): number {
  return typeof process.stdout.columns === "number" &&
    Number.isFinite(process.stdout.columns)
    ? process.stdout.columns
    : 120;
}

function readTerminalRows(): number {
  return typeof process.stdout.rows === "number" &&
    Number.isFinite(process.stdout.rows)
    ? process.stdout.rows
    : 36;
}

function resolvePreferredWidth(
  terminalWidth: number,
  preferences: OverlaySizePreferences,
): number {
  const breakpoints = preferences.preferredWidths ?? DEFAULT_PREFERRED_WIDTHS;
  for (const { minWidth, width } of breakpoints) {
    if (terminalWidth >= minWidth) {
      return width;
    }
  }

  return preferences.defaultWidth ?? DEFAULT_WIDTH;
}

export function resolveOverlayOptions(
  preferences: OverlaySizePreferences = {},
): OverlayOptions {
  const terminalWidth = readTerminalColumns();
  const terminalHeight = readTerminalRows();

  const margin = 1;
  const availableWidth = Math.max(24, terminalWidth - margin * 2);
  const preferredWidth = resolvePreferredWidth(terminalWidth, preferences);
  const width = Math.max(24, Math.min(preferredWidth, availableWidth));

  const minHeight = preferences.minHeight ?? DEFAULT_MIN_HEIGHT;
  const heightFraction = preferences.heightFraction ?? DEFAULT_HEIGHT_FRACTION;
  const availableHeight = Math.max(minHeight, terminalHeight - margin * 2);
  const preferredHeight = Math.max(minHeight, Math.floor(terminalHeight * heightFraction));
  const maxHeight = Math.min(preferredHeight, availableHeight);

  return {
    anchor: "center",
    width,
    maxHeight,
    margin,
  };
}

export type CellAlignment = "start" | "end";

export function alignCell(value: string, width: number, alignment: CellAlignment = "start"): string {
  const clipped = fitLine(value, width);
  const padding = Math.max(0, width - visibleWidth(clipped));
  return alignment === "end"
    ? `${" ".repeat(padding)}${clipped}`
    : `${clipped}${" ".repeat(padding)}`;
}

export function resolveMaxRenderRows(maxRenderRows: number, minHeight: number): number {
  const terminalRows =
    typeof process.stdout.rows === "number" &&
    Number.isFinite(process.stdout.rows) &&
    process.stdout.rows > 0
      ? Math.floor(process.stdout.rows)
      : maxRenderRows;

  return Math.max(minHeight, Math.min(maxRenderRows, terminalRows));
}

export interface CursorScrollState {
  cursorIndex: number;
  scrollOffset: number;
}

export function computeCursorScroll(
  cursorIndex: number,
  scrollOffset: number,
  itemCount: number,
  viewportSize: number,
): CursorScrollState {
  if (itemCount === 0) {
    return { cursorIndex: 0, scrollOffset: 0 };
  }

  const clampedCursor = clamp(cursorIndex, 0, itemCount - 1);

  let nextScroll = scrollOffset;
  if (clampedCursor < nextScroll) {
    nextScroll = clampedCursor;
  } else if (clampedCursor >= nextScroll + viewportSize) {
    nextScroll = clampedCursor - viewportSize + 1;
  }

  const maxOffset = Math.max(0, itemCount - viewportSize);
  nextScroll = clamp(nextScroll, 0, maxOffset);

  return { cursorIndex: clampedCursor, scrollOffset: nextScroll };
}

export type NavigationKeyResult =
  | { handled: false }
  | { handled: true; action: "move"; delta: number }
  | { handled: true; action: "home" }
  | { handled: true; action: "end" };

export interface CursorMoveResult {
  moved: boolean;
  cursorIndex: number;
  scrollOffset: number;
}

export function moveCursorWithinBounds(
  cursorIndex: number,
  scrollOffset: number,
  itemCount: number,
  delta: number,
  viewportSize: number,
): CursorMoveResult {
  if (itemCount === 0) {
    return { moved: false, cursorIndex: 0, scrollOffset: 0 };
  }

  const nextCursor = clamp(cursorIndex + delta, 0, itemCount - 1);
  const next = computeCursorScroll(nextCursor, scrollOffset, itemCount, viewportSize);
  return { moved: true, cursorIndex: next.cursorIndex, scrollOffset: next.scrollOffset };
}

export function resolveNavigationKey(
  data: string,
  viewportSize: number,
): NavigationKeyResult {
  if (matchesKey(data, "up") || matchesKey(data, "k")) {
    return { handled: true, action: "move", delta: -1 };
  }

  if (matchesKey(data, "down") || matchesKey(data, "j")) {
    return { handled: true, action: "move", delta: 1 };
  }

  if (matchesKey(data, "pageUp")) {
    return { handled: true, action: "move", delta: -Math.max(1, viewportSize - 1) };
  }

  if (matchesKey(data, "pageDown")) {
    return { handled: true, action: "move", delta: Math.max(1, viewportSize - 1) };
  }

  if (matchesKey(data, "home")) {
    return { handled: true, action: "home" };
  }

  if (matchesKey(data, "end")) {
    return { handled: true, action: "end" };
  }

  return { handled: false };
}
