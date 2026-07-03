import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";

import { formatModeBadge, type SelectableAgent } from "../agent-target.js";
import {
  fitLine,
  formatTheme,
  frameBottom,
  frameDivider,
  frameLine,
  resolveOverlayOptions,
  type OverlaySizePreferences,
  type ThemeLike,
} from "./frame-helpers.js";
import { ListPicker } from "./list-picker-base.js";

const TITLE_TEXT = "SELECT TARGET AGENT";

const OVERLAY_PREFERENCES: OverlaySizePreferences = {
  preferredWidths: [
    { minWidth: 140, width: 96 },
    { minWidth: 120, width: 88 },
  ],
  defaultWidth: 80,
  heightFraction: 0.72,
  minHeight: 10,
};

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

class AgentTargetPicker extends ListPicker {
  constructor(
    private readonly agents: readonly SelectableAgent[],
    private readonly currentAgentName: string | null,
    theme: ThemeLike,
    maxRenderRows: number,
    private readonly onSelect: (agentName: string | null) => void,
    requestRender: () => void,
  ) {
    super(theme, maxRenderRows, requestRender);
    const currentIndex = currentAgentName
      ? agents.findIndex((agent) => agent.name === currentAgentName)
      : -1;
    this.cursorIndex = currentIndex >= 0 ? currentIndex : 0;
  }

  protected get itemCount(): number {
    return this.agents.length;
  }

  protected get minRenderHeight(): number {
    return 10;
  }

  render(_width: number): string[] {
    const lines: string[] = [];
    const frameInnerWidth = resolveOverlayOptions(OVERLAY_PREFERENCES).width - 2;
    const maxRows = this.resolveMaxRenderRows();
    const viewportSize = this.resolveViewportSize(maxRows);
    const { start, end } = this.prepareViewport(viewportSize);
    const currentText = this.currentAgentName ?? "none";
    const statsText = `CURRENT: ${currentText}  VISIBLE: ${this.agents.length === 0 ? "0-0/0" : `${start + 1}-${end}/${this.agents.length}`}`;

    this.pushPickerHeader(lines, frameInnerWidth, TITLE_TEXT, ` ${statsText}`);

    if (this.agents.length === 0) {
      lines.push(formatTheme(this.theme, "dim", frameLine(" No agents available.", frameInnerWidth)));
    } else {
      for (let index = start; index < end; index += 1) {
        const agent = this.agents[index];
        lines.push(
          this.formatPickerRow(
            frameInnerWidth,
            buildAgentRow(agent, agent.name === this.currentAgentName, index === this.cursorIndex, frameInnerWidth),
            index === this.cursorIndex,
          ),
        );
      }
    }

    lines.push(frameDivider(frameInnerWidth));
    lines.push(formatTheme(this.theme, "dim", frameLine(" ↑/↓/j/k: move  Enter: select  Esc/q: cancel ", frameInnerWidth)));
    lines.push(frameBottom(frameInnerWidth));
    return lines;
  }

  protected onCancel(): void {
    this.onSelect(null);
  }

  protected handlePickerAction(data: string): void {
    if (matchesKey(data, "return")) {
      const agent = this.agents[this.cursorIndex];
      this.onSelect(agent?.name ?? null);
    }
  }

  private resolveViewportSize(maxRows: number): number {
    const reservedRows = 6;
    return Math.max(1, maxRows - reservedRows);
  }
}

export async function showAgentTargetPicker(
  ctx: ExtensionCommandContext,
  agents: readonly SelectableAgent[],
  currentAgentName: string | null,
): Promise<string | null> {
  const overlayOptions = resolveOverlayOptions(OVERLAY_PREFERENCES);
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
