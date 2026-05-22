import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import {
  formatSessionAge,
  getResponsibleAgentDisplayName,
  getSessionTitle,
  shortenPath,
} from "../session-format.js";
import { loadSessionCleanupConfig } from "../config-store.js";
import type { SessionSelectionResult, SessionCleanupSession } from "../types.js";
import { resolvePickerIcons, type PickerIcons } from "../ui/icons.js";
import { buildLegendContent } from "../ui/legend.js";

interface ThemeLike {
  fg?: unknown;
  bold?: unknown;
}

interface PickerResultHandler {
  (result: SessionSelectionResult): void;
}

interface OverlayOptions {
  anchor: "center";
  width: number;
  maxHeight: number;
  margin: number;
}

interface ColumnLayout {
  description: number;
  agent: number;
  age: number;
  id: number;
  path: number;
}

type CellAlignment = "start" | "end";

const TITLE_TEXT = "SESSION CLEANUP : BATCH DELETE";
const ROW_PREFIX_WIDTH = 6;
const AGE_COLUMN_WIDTH = 5;
const ID_COLUMN_WIDTH = 8;
const COLUMN_GAP = "  ";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function fitLine(text: string, width: number): string {
  return truncateToWidth(text, Math.max(1, width), "…", true);
}

function formatTheme(theme: ThemeLike, color: string, text: string): string {
  try {
    if (typeof theme.fg === "function") {
      const format = theme.fg as (resolvedColor: string, value: string) => string;
      return format(color, text);
    }
  } catch {
    // Fall through to plain text rendering.
  }

  return text;
}

function formatBold(theme: ThemeLike, text: string): string {
  try {
    if (typeof theme.bold === "function") {
      const format = theme.bold as (value: string) => string;
      return format(text);
    }
  } catch {
    // Fall through to plain text rendering.
  }

  return text;
}

function frameTop(width: number): string {
  return `╭${"─".repeat(width)}╮`;
}

function frameDivider(width: number): string {
  return `├${"─".repeat(width)}┤`;
}

function frameBottom(width: number): string {
  return `╰${"─".repeat(width)}╯`;
}

function frameLine(content: string, width: number): string {
  const clipped = fitLine(content, width);
  const padded = clipped.padEnd(width, " ");
  return `│${padded}│`;
}

function resolveOverlayOptions(): OverlayOptions {
  const terminalWidth =
    typeof process.stdout.columns === "number" && Number.isFinite(process.stdout.columns)
      ? process.stdout.columns
      : 120;
  const terminalHeight =
    typeof process.stdout.rows === "number" && Number.isFinite(process.stdout.rows)
      ? process.stdout.rows
      : 36;

  const margin = 1;
  const availableWidth = Math.max(24, terminalWidth - margin * 2);
  const preferredWidth =
    terminalWidth >= 160 ? 118 : terminalWidth >= 140 ? 110 : terminalWidth >= 120 ? 100 : 92;
  const width = Math.max(24, Math.min(preferredWidth, availableWidth));

  const availableHeight = Math.max(12, terminalHeight - margin * 2);
  const preferredHeight = Math.max(12, Math.floor(terminalHeight * 0.86));
  const maxHeight = Math.min(preferredHeight, availableHeight);

  return {
    anchor: "center",
    width,
    maxHeight,
    margin,
  };
}

function alignCell(value: string, width: number, alignment: CellAlignment = "start"): string {
  const clipped = fitLine(value, width);
  const padding = Math.max(0, width - visibleWidth(clipped));
  return alignment === "end"
    ? `${" ".repeat(padding)}${clipped}`
    : `${clipped}${" ".repeat(padding)}`;
}

function resolveColumnLayout(contentWidth: number): ColumnLayout {
  const gapTotal = COLUMN_GAP.length * 4;
  const availableColumns = Math.max(5, contentWidth - ROW_PREFIX_WIDTH - gapTotal);
  const fixedColumns = AGE_COLUMN_WIDTH + ID_COLUMN_WIDTH;
  const flexibleColumns = Math.max(3, availableColumns - fixedColumns);

  let description = 12;
  let agent = 8;
  let path = 12;

  const minimumFlexibleColumns = description + agent + path;

  if (flexibleColumns >= minimumFlexibleColumns) {
    const extra = flexibleColumns - minimumFlexibleColumns;
    description += Math.floor(extra * 0.45);
    path += Math.floor(extra * 0.4);
    agent += Math.min(6, extra - (description - 12) - (path - 12));
    path += flexibleColumns - (description + agent + path);
  } else {
    agent = Math.max(4, Math.floor(flexibleColumns * 0.18));
    description = Math.max(6, Math.floor(flexibleColumns * 0.42));
    path = Math.max(1, flexibleColumns - agent - description);

    if (path < 6 && description > 6) {
      const shift = Math.min(6 - path, description - 6);
      description -= shift;
      path += shift;
    }

    if (path < 6 && agent > 4) {
      const shift = Math.min(6 - path, agent - 4);
      agent -= shift;
      path += shift;
    }

    path = Math.max(1, flexibleColumns - agent - description);
  }

  return {
    description,
    agent,
    age: AGE_COLUMN_WIDTH,
    id: ID_COLUMN_WIDTH,
    path,
  };
}

function buildStatsLine(
  contentWidth: number,
  totalSessions: number,
  selectedCount: number,
  start: number,
  end: number,
): string {
  const segmentGap = "  ";
  const totalGapWidth = segmentGap.length * 2;
  const baseSegmentWidth = Math.max(1, Math.floor((contentWidth - totalGapWidth) / 3));
  const remainingWidth = Math.max(0, contentWidth - totalGapWidth - baseSegmentWidth * 3);
  const segmentWidths = [
    baseSegmentWidth + remainingWidth,
    baseSegmentWidth,
    baseSegmentWidth,
  ] as const;
  const visibleRange = totalSessions === 0 ? "0-0/0" : `${start + 1}-${end}/${totalSessions}`;
  const segments = [
    alignCell(`TOTAL: ${totalSessions}`, segmentWidths[0]),
    alignCell(`SELECTED: ${selectedCount}`, segmentWidths[1]),
    alignCell(`VISIBLE: ${visibleRange}`, segmentWidths[2]),
  ];

  return segments.join(segmentGap);
}

function buildColumnLine(
  layout: ColumnLayout,
  values: {
    description: string;
    agent: string;
    age: string;
    id: string;
    path: string;
  },
): string {
  return [
    alignCell(values.description, layout.description),
    alignCell(values.agent, layout.agent),
    alignCell(values.age, layout.age, "end"),
    alignCell(values.id, layout.id),
    alignCell(values.path, layout.path),
  ].join(COLUMN_GAP);
}

function buildColumnHeaderLine(layout: ColumnLayout): string {
  return `${" ".repeat(ROW_PREFIX_WIDTH)}${buildColumnLine(layout, {
    description: "TASK DESCRIPTION",
    agent: "AGENT",
    age: "AGE",
    id: "ID",
    path: "PATH",
  })}`;
}

function buildSessionRow(
  session: SessionCleanupSession,
  selected: boolean,
  focused: boolean,
  layout: ColumnLayout,
): string {
  const prefix = `${focused ? ">" : " "} ${selected ? "[x]" : "[ ]"} `;
  return `${prefix}${buildColumnLine(layout, {
    description: getSessionTitle(session),
    agent: `@${getResponsibleAgentDisplayName(session)}`,
    age: formatSessionAge(session.modified),
    id: session.id.slice(0, 8),
    path: shortenPath(session.cwd || "(unknown cwd)"),
  })}`;
}

class SessionCleanupPicker implements Component {
  private cursorIndex = 0;

  private scrollOffset = 0;

  private inlineMessage: string | null = null;

  private lastViewportSize = 10;

  private readonly icons: PickerIcons;

  constructor(
    private readonly sessions: readonly SessionCleanupSession[],
    private readonly selectedPaths: Set<string>,
    private readonly theme: ThemeLike,
    initialIcons: PickerIcons,
    private readonly maxRenderRows: number,
    private readonly onFinish: PickerResultHandler,
    private readonly requestRender: () => void,
  ) {
    this.icons = initialIcons;
  }

  invalidate(): void {
    // Rendering is state driven.
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, Math.floor(width));
    const frameInnerWidth = Math.max(22, safeWidth - 2);
    const maxRows = this.resolveMaxRenderRows();
    const legend = buildLegendContent(this.icons, frameInnerWidth);
    const viewportSize = this.resolveViewportSize(maxRows, legend.lines.length);
    const columns = resolveColumnLayout(frameInnerWidth);

    this.lastViewportSize = viewportSize;
    this.ensureCursorVisible(viewportSize);

    const start = this.scrollOffset;
    const end = Math.min(this.sessions.length, start + viewportSize);

    const lines: string[] = [];
    lines.push(frameTop(frameInnerWidth));
    lines.push(
      formatTheme(
        this.theme,
        "accent",
        formatBold(this.theme, frameLine(` ${TITLE_TEXT}`, frameInnerWidth)),
      ),
    );
    lines.push(
      formatTheme(
        this.theme,
        "dim",
        frameLine(
          buildStatsLine(
            frameInnerWidth,
            this.sessions.length,
            this.selectedPaths.size,
            start,
            end,
          ),
          frameInnerWidth,
        ),
      ),
    );
    lines.push(frameDivider(frameInnerWidth));
    lines.push(
      formatTheme(
        this.theme,
        "accent",
        formatBold(this.theme, frameLine(buildColumnHeaderLine(columns), frameInnerWidth)),
      ),
    );
    lines.push(frameDivider(frameInnerWidth));

    if (this.sessions.length === 0) {
      lines.push(
        formatTheme(
          this.theme,
          "dim",
          frameLine(
            `${" ".repeat(ROW_PREFIX_WIDTH)}${fitLine(
              "No sessions found for this scope.",
              frameInnerWidth - ROW_PREFIX_WIDTH,
            )}`,
            frameInnerWidth,
          ),
        ),
      );
    } else {
      for (let index = start; index < end; index += 1) {
        const session = this.sessions[index];
        const rowLine = frameLine(
          buildSessionRow(
            session,
            this.selectedPaths.has(session.path),
            index === this.cursorIndex,
            columns,
          ),
          frameInnerWidth,
        );

        lines.push(
          index === this.cursorIndex
            ? formatTheme(this.theme, "accent", formatBold(this.theme, rowLine))
            : rowLine,
        );
      }
    }

    if (this.inlineMessage) {
      lines.push(frameDivider(frameInnerWidth));
      lines.push(
        formatTheme(
          this.theme,
          "warning",
          frameLine(` ${this.inlineMessage}`, frameInnerWidth),
        ),
      );
    }

    lines.push(frameDivider(frameInnerWidth));
    for (const legendLine of legend.lines) {
      lines.push(formatTheme(this.theme, "dim", frameLine(` ${legendLine}`, frameInnerWidth)));
    }

    lines.push(frameBottom(frameInnerWidth));
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.finish({
        cancelled: true,
        refreshRequested: false,
        selectedPaths: new Set(this.selectedPaths),
      });
      return;
    }

    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.moveCursor(-1);
      return;
    }

    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.moveCursor(1);
      return;
    }

    if (matchesKey(data, "pageUp")) {
      this.moveCursor(-Math.max(1, this.lastViewportSize - 1));
      return;
    }

    if (matchesKey(data, "pageDown")) {
      this.moveCursor(Math.max(1, this.lastViewportSize - 1));
      return;
    }

    if (matchesKey(data, "home")) {
      this.cursorIndex = 0;
      this.inlineMessage = null;
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "end")) {
      this.cursorIndex = Math.max(0, this.sessions.length - 1);
      this.inlineMessage = null;
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "space")) {
      this.toggleCurrent();
      return;
    }

    if (matchesKey(data, "a")) {
      this.toggleAll();
      return;
    }

    if (matchesKey(data, "r")) {
      this.finish({
        cancelled: false,
        refreshRequested: true,
        selectedPaths: new Set(this.selectedPaths),
      });
      return;
    }

    if (matchesKey(data, "return")) {
      if (this.selectedPaths.size === 0) {
        this.inlineMessage = "No sessions selected. Toggle at least one session first.";
        this.requestRender();
        return;
      }

      this.finish({
        cancelled: false,
        refreshRequested: false,
        selectedPaths: new Set(this.selectedPaths),
      });
    }
  }

  private finish(result: SessionSelectionResult): void {
    this.onFinish(result);
  }

  private moveCursor(delta: number): void {
    if (this.sessions.length === 0) {
      this.cursorIndex = 0;
      this.scrollOffset = 0;
      return;
    }

    this.cursorIndex = clamp(this.cursorIndex + delta, 0, this.sessions.length - 1);
    this.inlineMessage = null;
    this.ensureCursorVisible(this.lastViewportSize);
    this.requestRender();
  }

  private toggleCurrent(): void {
    const session = this.sessions[this.cursorIndex];
    if (!session) {
      return;
    }

    if (this.selectedPaths.has(session.path)) {
      this.selectedPaths.delete(session.path);
    } else {
      this.selectedPaths.add(session.path);
    }

    this.inlineMessage = null;
    this.requestRender();
  }

  private toggleAll(): void {
    if (this.selectedPaths.size === this.sessions.length) {
      this.selectedPaths.clear();
    } else {
      for (const session of this.sessions) {
        this.selectedPaths.add(session.path);
      }
    }

    this.inlineMessage = null;
    this.requestRender();
  }

  private resolveMaxRenderRows(): number {
    const terminalRows =
      typeof process.stdout.rows === "number" &&
      Number.isFinite(process.stdout.rows) &&
      process.stdout.rows > 0
        ? Math.floor(process.stdout.rows)
        : this.maxRenderRows;

    return Math.max(12, Math.min(this.maxRenderRows, terminalRows));
  }

  private resolveViewportSize(maxRows: number, legendLineCount: number): number {
    const inlineMessageRows = this.inlineMessage ? 2 : 0;
    const reservedRows = 8 + legendLineCount + inlineMessageRows;
    return Math.max(1, maxRows - reservedRows);
  }

  private ensureCursorVisible(viewportSize: number): void {
    if (this.sessions.length === 0) {
      this.cursorIndex = 0;
      this.scrollOffset = 0;
      return;
    }

    this.cursorIndex = clamp(this.cursorIndex, 0, this.sessions.length - 1);

    if (this.cursorIndex < this.scrollOffset) {
      this.scrollOffset = this.cursorIndex;
    } else if (this.cursorIndex >= this.scrollOffset + viewportSize) {
      this.scrollOffset = this.cursorIndex - viewportSize + 1;
    }

    const maxOffset = Math.max(0, this.sessions.length - viewportSize);
    this.scrollOffset = clamp(this.scrollOffset, 0, maxOffset);
  }
}

export async function showSessionCleanupPicker(
  ctx: ExtensionCommandContext,
  sessions: readonly SessionCleanupSession[],
): Promise<SessionSelectionResult> {
  const selectedPaths = new Set<string>();
  const overlayOptions = resolveOverlayOptions();
  const config = loadSessionCleanupConfig();
  const resolvedIcons = resolvePickerIcons(config.iconMode);

  let finalResult: SessionSelectionResult | null = null;

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) => {
      const picker = new SessionCleanupPicker(
        sessions,
        selectedPaths,
        theme,
        resolvedIcons.icons,
        overlayOptions.maxHeight,
        (result) => {
          finalResult = result;
          done();
        },
        () => {
          tui.requestRender();
        },
      );

      return picker;
    },
    {
      overlay: true,
      overlayOptions,
    },
  );

  if (finalResult) {
    return finalResult;
  }

  return {
    cancelled: true,
    refreshRequested: false,
    selectedPaths,
  };
}
