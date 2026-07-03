import { matchesKey, type Component } from "@earendil-works/pi-tui";

import {
  computeCursorScroll,
  formatBold,
  formatTheme,
  frameDivider,
  frameLine,
  frameTop,
  moveCursorWithinBounds,
  resolveMaxRenderRows as resolveMaxRenderRowsBase,
  resolveNavigationKey,
  type ThemeLike,
} from "./frame-helpers.js";

/**
 * Shared base for the list pickers in this extension.
 *
 * Centralizes the cursor/scroll viewport state machine and the list-navigation
 * input handling that `AgentTargetPicker` and `SessionCleanupPicker` previously
 * duplicated verbatim. Subclasses provide the item count, the render body, and
 * the picker-specific input actions (select / toggle / refresh) via the
 * `onCancel` and `handlePickerAction` hooks.
 */
export abstract class ListPicker implements Component {
  protected cursorIndex = 0;
  protected scrollOffset = 0;
  protected lastViewportSize = 1;

  protected constructor(
    protected readonly theme: ThemeLike,
    protected readonly maxRenderRows: number,
    protected readonly requestRender: () => void,
  ) {}

  /** Number of selectable items driving cursor bounds and scroll clamping. */
  protected abstract get itemCount(): number;

  /** Minimum render-row floor forwarded to `resolveMaxRenderRows`. */
  protected abstract get minRenderHeight(): number;

  /** Invoked when the user dismisses the picker (Esc / Ctrl+C / q). */
  protected abstract onCancel(): void;

  /**
   * Invoked for input that is neither cancel nor list navigation, so each
   * picker can handle its own actions (select, toggle, refresh, ...).
   */
  protected abstract handlePickerAction(data: string): void;

  abstract render(width: number): string[];

  /**
   * Hook invoked after the cursor moves via navigation or a direct jump.
   * Subclasses can clear transient UI state such as an inline message.
   */
  protected onCursorMoved(): void {}

  /**
   * Template-method input handler: cancel first, then list navigation, then
   * the picker-specific actions. Subclasses customize behavior through
   * `onCancel` and `handlePickerAction` instead of overriding this method.
   */
  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.onCancel();
      return;
    }

    if (this.handleNavigation(data)) {
      return;
    }

    this.handlePickerAction(data);
  }

  /**
   * Dispatches a resolved navigation key (move / home / end). Returns `true`
   * when the input was consumed as navigation so the caller can short-circuit.
   */
  protected handleNavigation(data: string): boolean {
    const navigation = resolveNavigationKey(data, this.lastViewportSize);
    if (!navigation.handled) {
      return false;
    }

    if (navigation.action === "move") {
      this.moveCursor(navigation.delta);
    } else {
      this.cursorIndex = navigation.action === "home" ? 0 : Math.max(0, this.itemCount - 1);
      this.onCursorMoved();
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
    }
    return true;
  }

  /**
   * Applies the viewport for a render pass: records its size, clamps the cursor
   * into view, and resolves the visible [start, end) slice. Shared by both
   * pickers so the viewport setup is not duplicated in each render method.
   */
  protected prepareViewport(viewportSize: number): { start: number; end: number } {
    this.lastViewportSize = viewportSize;
    this.ensureCursorVisible(viewportSize);
    const start = this.scrollOffset;
    const end = Math.min(this.itemCount, start + viewportSize);
    return { start, end };
  }

  protected moveCursor(delta: number): void {
    const result = moveCursorWithinBounds(
      this.cursorIndex,
      this.scrollOffset,
      this.itemCount,
      delta,
      this.lastViewportSize,
    );
    this.cursorIndex = result.cursorIndex;
    this.scrollOffset = result.scrollOffset;
    if (result.moved) {
      this.onCursorMoved();
      this.ensureCursorVisible(this.lastViewportSize);
      this.requestRender();
    }
  }

  protected resolveMaxRenderRows(): number {
    return resolveMaxRenderRowsBase(this.maxRenderRows, this.minRenderHeight);
  }

  protected ensureCursorVisible(viewportSize: number): void {
    const next = computeCursorScroll(
      this.cursorIndex,
      this.scrollOffset,
      this.itemCount,
      viewportSize,
    );
    this.cursorIndex = next.cursorIndex;
    this.scrollOffset = next.scrollOffset;
  }

  /** Pushes the shared frame header: top border, title, stats line, divider.
   *
   * `title` is rendered with a leading space (both pickers indent the title).
   * `statsContent` is framed verbatim so each picker controls its own stats
   * indentation. */
  protected pushPickerHeader(
    lines: string[],
    frameInnerWidth: number,
    title: string,
    statsContent: string,
  ): void {
    lines.push(frameTop(frameInnerWidth));
    lines.push(
      formatTheme(this.theme, "accent", formatBold(this.theme, frameLine(` ${title}`, frameInnerWidth))),
    );
    lines.push(formatTheme(this.theme, "dim", frameLine(statsContent, frameInnerWidth)));
    lines.push(frameDivider(frameInnerWidth));
  }

  /** Builds a framed row, highlighted (accent + bold) when it is the cursor row. */
  protected formatPickerRow(frameInnerWidth: number, content: string, isCursor: boolean): string {
    const framed = frameLine(content, frameInnerWidth);
    return isCursor
      ? formatTheme(this.theme, "accent", formatBold(this.theme, framed))
      : framed;
  }
}
