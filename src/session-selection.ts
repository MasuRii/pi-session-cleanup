import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { buildSessionSelectionLabel } from "./session-format.js";
import { showSessionCleanupPicker } from "./tui/session-cleanup-picker.js";
import type { SessionCleanupSession, SessionSelectionResult } from "./types.js";

interface ConfirmAction {
  kind: "confirm";
}

interface ToggleAllAction {
  kind: "toggle-all";
}

interface RefreshAction {
  kind: "refresh";
}

interface CancelAction {
  kind: "cancel";
}

interface ToggleSessionAction {
  kind: "toggle-session";
  sessionPath: string;
}

type SelectionAction =
  | ConfirmAction
  | ToggleAllAction
  | RefreshAction
  | CancelAction
  | ToggleSessionAction;

function buildMenu(
  sessions: readonly SessionCleanupSession[],
  selectedPaths: ReadonlySet<string>,
): {
  labels: string[];
  actionsByLabel: Map<string, SelectionAction>;
} {
  const labels: string[] = [];
  const actionsByLabel = new Map<string, SelectionAction>();

  const confirmLabel = `✅ Delete selected (${selectedPaths.size})`;
  labels.push(confirmLabel);
  actionsByLabel.set(confirmLabel, { kind: "confirm" });

  const toggleAllLabel =
    selectedPaths.size === sessions.length
      ? "☐ Clear all selections"
      : "☑ Select all sessions";
  labels.push(toggleAllLabel);
  actionsByLabel.set(toggleAllLabel, { kind: "toggle-all" });

  const refreshLabel = "↻ Refresh session list";
  labels.push(refreshLabel);
  actionsByLabel.set(refreshLabel, { kind: "refresh" });

  const cancelLabel = "✖ Cancel";
  labels.push(cancelLabel);
  actionsByLabel.set(cancelLabel, { kind: "cancel" });

  sessions.forEach((session, index) => {
    const label = buildSessionSelectionLabel(
      session,
      index,
      selectedPaths.has(session.path),
    );
    labels.push(label);
    actionsByLabel.set(label, {
      kind: "toggle-session",
      sessionPath: session.path,
    });
  });

  return { labels, actionsByLabel };
}

async function selectSessionsWithLegacyMenu(
  ctx: ExtensionCommandContext,
  sessions: readonly SessionCleanupSession[],
): Promise<SessionSelectionResult> {
  const selectedPaths = new Set<string>();

  while (true) {
    const menu = buildMenu(sessions, selectedPaths);
    const selectedLabel = await ctx.ui.select(
      "Select sessions to delete (toggle multiple, then confirm)",
      menu.labels,
    );

    if (!selectedLabel) {
      return {
        cancelled: true,
        refreshRequested: false,
        selectedPaths,
      };
    }

    const action = menu.actionsByLabel.get(selectedLabel);
    if (!action) {
      ctx.ui.notify("Unknown selection action. Please try again.", "warning");
      continue;
    }

    switch (action.kind) {
      case "confirm": {
        return {
          cancelled: false,
          refreshRequested: false,
          selectedPaths,
        };
      }
      case "toggle-all": {
        if (selectedPaths.size === sessions.length) {
          selectedPaths.clear();
        } else {
          sessions.forEach((session) => selectedPaths.add(session.path));
        }
        break;
      }
      case "refresh": {
        return {
          cancelled: false,
          refreshRequested: true,
          selectedPaths,
        };
      }
      case "cancel": {
        return {
          cancelled: true,
          refreshRequested: false,
          selectedPaths,
        };
      }
      case "toggle-session": {
        if (selectedPaths.has(action.sessionPath)) {
          selectedPaths.delete(action.sessionPath);
        } else {
          selectedPaths.add(action.sessionPath);
        }
        break;
      }
      default: {
        const unreachable: never = action;
        throw new Error(`Unhandled selection action: ${String(unreachable)}`);
      }
    }
  }
}

export async function selectSessionsForCleanup(
  ctx: ExtensionCommandContext,
  sessions: readonly SessionCleanupSession[],
): Promise<SessionSelectionResult> {
  try {
    return await showSessionCleanupPicker(ctx, sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(
      `Interactive picker failed (${message}). Falling back to basic selector.`,
      "warning",
    );
    return selectSessionsWithLegacyMenu(ctx, sessions);
  }
}
