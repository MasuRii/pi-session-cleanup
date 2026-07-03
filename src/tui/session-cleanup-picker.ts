import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey } from "@earendil-works/pi-tui";

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
import {
  alignCell,
  fitLine,
  formatBold,
  formatTheme,
  frameBottom,
  frameDivider,
  frameLine,
  resolveOverlayOptions,
  type CellAlignment,
  type OverlaySizePreferences,
  type ThemeLike,
} from "./frame-helpers.js";
import { ListPicker } from "./list-picker-base.js";

interface PickerResultHandler {
  (result: SessionSelectionResult): void;
}

interface ColumnLayout {
  description: number;
  agent: number;
  age: number;
  id: number;
  path: number;
}

const TITLE_TEXT = "SESSION CLEANUP : BATCH DELETE";
const ROW_PREFIX_WIDTH = 6;
const AGE_COLUMN_WIDTH = 5;
const ID_COLUMN_WIDTH = 8;
const COLUMN_GAP = "  ";

// `preferredWidths` is intentionally omitted: it matches the
// `DEFAULT_PREFERRED_WIDTHS` fallback inside `resolveOverlayOptions`, so
// restating it here would duplicate that constant (Avoid Redundancies).
const OVERLAY_PREFERENCES: OverlaySizePreferences = {
  defaultWidth: 92,
  heightFraction: 0.86,
  minHeight: 12,
};

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

class SessionCleanupPicker extends ListPicker {
  private inlineMessage: string | null = null;

  private readonly icons: PickerIcons;

  constructor(
    private readonly sessions: readonly SessionCleanupSession[],
    private readonly selectedPaths: Set<string>,
    theme: ThemeLike,
    initialIcons: PickerIcons,
    maxRenderRows: number,
    private readonly onFinish: PickerResultHandler,
    requestRender: () => void,
  ) {
    super(theme, maxRenderRows, requestRender);
    this.icons = initialIcons;
  }

  invalidate(): void {
    // Rendering is state driven.
  }

  protected get itemCount(): number {
    return this.sessions.length;
  }

  protected get minRenderHeight(): number {
    return 12;
  }

  protected onCursorMoved(): void {
    this.inlineMessage = null;
  }

  render(width: number): string[] {
    const safeWidth = Math.max(24, Math.floor(width));
    const frameInnerWidth = Math.max(22, safeWidth - 2);
    const maxRows = this.resolveMaxRenderRows();
    const legend = buildLegendContent(this.icons, frameInnerWidth);
    const viewportSize = this.resolveViewportSize(maxRows, legend.lines.length);
    const columns = resolveColumnLayout(frameInnerWidth);
    const { start, end } = this.prepareViewport(viewportSize);

    const lines: string[] = [];
    this.pushPickerHeader(
      lines,
      frameInnerWidth,
      TITLE_TEXT,
      buildStatsLine(frameInnerWidth, this.sessions.length, this.selectedPaths.size, start, end),
    );
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
        lines.push(
          this.formatPickerRow(
            frameInnerWidth,
            buildSessionRow(
              session,
              this.selectedPaths.has(session.path),
              index === this.cursorIndex,
              columns,
            ),
            index === this.cursorIndex,
          ),
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

  protected onCancel(): void {
    this.finish({
      cancelled: true,
      refreshRequested: false,
      selectedPaths: new Set(this.selectedPaths),
    });
  }

  protected handlePickerAction(data: string): void {
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

  private resolveViewportSize(maxRows: number, legendLineCount: number): number {
    const inlineMessageRows = this.inlineMessage ? 2 : 0;
    const reservedRows = 8 + legendLineCount + inlineMessageRows;
    return Math.max(1, maxRows - reservedRows);
  }
}

export async function showSessionCleanupPicker(
  ctx: ExtensionCommandContext,
  sessions: readonly SessionCleanupSession[],
): Promise<SessionSelectionResult> {
  const overlayOptions = resolveOverlayOptions(OVERLAY_PREFERENCES);
  const config = loadSessionCleanupConfig();
  const resolvedIcons = resolvePickerIcons(config.iconMode);
  const selectedPaths = new Set<string>();

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
