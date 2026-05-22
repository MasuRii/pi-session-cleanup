import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";

import type { SelectableAgent } from "../agent-target.js";

interface ThemeLike {
  fg?: unknown;
  bold?: unknown;
}

interface OverlayOptions {
  anchor: "center";
  width: number;
  maxHeight: number;
  margin: number;
}

const TITLE_TEXT = "SELECT TARGET AGENT";

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
    // Fall back to plain text.
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
    // Fall back to plain text.
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
  const preferredWidth = terminalWidth >= 140 ? 96 : terminalWidth >= 120 ? 88 : 80;
  const width = Math.max(24, Math.min(preferredWidth, availableWidth));

  const availableHeight = Math.max(10, terminalHeight - margin * 2);
  const preferredHeight = Math.max(10, Math.floor(terminalHeight * 0.72));
  const maxHeight = Math.min(preferredHeight, availableHeight);

  return {
    anchor: "center",
    width,
    maxHeight,
    margin,
  };
}

function formatModeBadge(agent: SelectableAgent): string {
  return `[${agent.mode ?? "primary"}]`;
}

function buildAgentRow(
  agent: SelectableAgent,
  isCurrent: boolean,
  isSelected: boolean,
  width: number,
): string {
  const prefix = isSelected ? "❯ " : "  ";
  const currentMarker = isCurrent ? "●" : "○";
  const leading = `${prefix}${currentMarker} ${agent.name} ${formatModeBadge(agent)} — `;
  const availableDescriptionWidth = Math.max(1, width - visibleWidth(leading));
  return `${leading}${fitLine(agent.description, availableDescriptionWidth)}`;
}

class AgentTargetPicker implements Component {
  private cursorIndex: number;
  private scrollOffset = 0;
  private lastViewportSize = 1;

  constructor(
    private readonly agents: readonly SelectableAgent[],
    private readonly currentAgentName: string | null,
    private readonly theme: ThemeLike,
    private readonly maxRenderRows: number,
    private readonly onSelect: (agentName: string | null) => void,
    private readonly requestRender: () => void,
  ) {
    const currentIndex = currentAgentName
      ? agents.findIndex((agent) => agent.name === currentAgentName)
      : -1;
    this.cursorIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    const frameInnerWidth = resolveOverlayOptions().width - 2;
    const maxRows = this.resolveMaxRenderRows();
    const viewportSize = this.resolveViewportSize(maxRows);
    this.lastViewportSize = viewportSize;
    this.ensureCursorVisible(viewportSize);

    const start = this.scrollOffset;
    const end = Math.min(this.agents.length, start + viewportSize);
    const currentText = this.currentAgentName ?? "none";
    const statsText = `CURRENT: ${currentText}  VISIBLE: ${this.agents.length === 0 ? "0-0/0" : `${start + 1}-${end}/${this.agents.length}`}`;

    lines.push(frameTop(frameInnerWidth));
    lines.push(
      formatTheme(
        this.theme,
        "accent",
        formatBold(this.theme, frameLine(` ${TITLE_TEXT}`, frameInnerWidth)),
      ),
    );
    lines.push(formatTheme(this.theme, "dim", frameLine(` ${statsText}`, frameInnerWidth)));
    lines.push(frameDivider(frameInnerWidth));

    if (this.agents.length === 0) {
      lines.push(formatTheme(this.theme, "dim", frameLine(" No agents available.", frameInnerWidth)));
    } else {
      for (let index = start; index < end; index += 1) {
        const agent = this.agents[index];
        const row = frameLine(
          buildAgentRow(agent, agent.name === this.currentAgentName, index === this.cursorIndex, frameInnerWidth),
          frameInnerWidth,
        );
        lines.push(
          index === this.cursorIndex
            ? formatTheme(this.theme, "accent", formatBold(this.theme, row))
            : row,
        );
      }
    }

    lines.push(frameDivider(frameInnerWidth));
    lines.push(formatTheme(this.theme, "dim", frameLine(" ↑/↓/j/k: move  Enter: select  Esc/q: cancel ", frameInnerWidth)));
    lines.push(frameBottom(frameInnerWidth));
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.onSelect(null);
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
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "end")) {
      this.cursorIndex = Math.max(0, this.agents.length - 1);
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "return")) {
      const agent = this.agents[this.cursorIndex];
      this.onSelect(agent?.name ?? null);
    }
  }

  private moveCursor(delta: number): void {
    if (this.agents.length === 0) {
      this.cursorIndex = 0;
      this.scrollOffset = 0;
      return;
    }

    this.cursorIndex = clamp(this.cursorIndex + delta, 0, this.agents.length - 1);
    this.ensureCursorVisible(this.lastViewportSize);
    this.requestRender();
  }

  private resolveMaxRenderRows(): number {
    const terminalRows =
      typeof process.stdout.rows === "number" && Number.isFinite(process.stdout.rows) && process.stdout.rows > 0
        ? Math.floor(process.stdout.rows)
        : this.maxRenderRows;

    return Math.max(10, Math.min(this.maxRenderRows, terminalRows));
  }

  private resolveViewportSize(maxRows: number): number {
    const reservedRows = 6;
    return Math.max(1, maxRows - reservedRows);
  }

  private ensureCursorVisible(viewportSize: number): void {
    if (this.agents.length === 0) {
      this.cursorIndex = 0;
      this.scrollOffset = 0;
      return;
    }

    this.cursorIndex = clamp(this.cursorIndex, 0, this.agents.length - 1);

    if (this.cursorIndex < this.scrollOffset) {
      this.scrollOffset = this.cursorIndex;
    } else if (this.cursorIndex >= this.scrollOffset + viewportSize) {
      this.scrollOffset = this.cursorIndex - viewportSize + 1;
    }

    const maxOffset = Math.max(0, this.agents.length - viewportSize);
    this.scrollOffset = clamp(this.scrollOffset, 0, maxOffset);
  }
}

export async function showAgentTargetPicker(
  ctx: ExtensionCommandContext,
  agents: readonly SelectableAgent[],
  currentAgentName: string | null,
): Promise<string | null> {
  const overlayOptions = resolveOverlayOptions();
  let selectedAgentName: string | null = null;
  let resolved = false;

  await ctx.ui.custom<void>(
    (tui, theme, _keybindings, done) =>
      new AgentTargetPicker(
        agents,
        currentAgentName,
        theme,
        overlayOptions.maxHeight,
        (agentName) => {
          resolved = true;
          selectedAgentName = agentName;
          done();
        },
        () => {
          tui.requestRender();
        },
      ),
    {
      overlay: true,
      overlayOptions,
    },
  );

  return resolved ? selectedAgentName : null;
}
