import type {
  ExtensionCommandContext,
  SessionInfo,
} from "@earendil-works/pi-coding-agent";

import {
  SESSION_CLEANUP_COMMAND,
} from "./constants.js";
import { getSessionTitle } from "./session-format.js";
import { deleteSessionFile } from "./session-delete.js";
import { loadSessions } from "./session-source.js";
import { selectSessionsForCleanup } from "./session-selection.js";
import type {
  BatchDeleteResult,
  SessionCleanupSession,
  SessionScope,
} from "./types.js";

const ARG_COMPLETIONS = [
  {
    value: "current",
    label: "current",
    description: "List sessions from the current working directory only",
  },
  {
    value: "all",
    label: "all",
    description: "List sessions across every working directory",
  },
  {
    value: "help",
    label: "help",
    description: "Show usage",
  },
] as const;

interface ParsedArgs {
  help: boolean;
  scope: SessionScope;
  error?: string;
}

function usage(): string {
  return `Usage: /${SESSION_CLEANUP_COMMAND} [current|all]`;
}

function parseArgs(args: string): ParsedArgs {
  const normalized = args.trim().toLowerCase();
  if (!normalized) {
    return { help: false, scope: "current" };
  }

  if (normalized === "help") {
    return { help: true, scope: "current" };
  }

  if (normalized === "current" || normalized === "all") {
    return { help: false, scope: normalized };
  }

  return {
    help: false,
    scope: "current",
    error: `Unknown argument: ${args.trim()}`,
  };
}

function buildSelectionSummary(sessions: readonly SessionInfo[]): string {
  const preview = sessions
    .slice(0, 6)
    .map((session) => `- ${getSessionTitle(session)} (${session.id.slice(0, 8)})`)
    .join("\n");
  const hiddenCount = Math.max(0, sessions.length - 6);

  if (hiddenCount > 0) {
    return `${preview}\n- …and ${hiddenCount} more`;
  }

  return preview;
}

function buildConfirmationMessage(sessions: readonly SessionInfo[]): string {
  const noun = sessions.length === 1 ? "session" : "sessions";
  return `Delete ${sessions.length} selected ${noun}?\n\n${buildSelectionSummary(sessions)}\n\nThis action removes session files. Pi will try trash first, then permanent delete if trash is unavailable.`;
}

function summarizeFailures(
  failures: readonly { session: SessionInfo; error: string }[],
): string {
  return failures
    .slice(0, 4)
    .map(
      (failure) =>
        `- ${failure.session.id.slice(0, 8)} (${getSessionTitle(failure.session)}): ${failure.error}`,
    )
    .join("\n");
}

async function deleteSelectedSessions(
  selectedSessions: readonly SessionInfo[],
  currentSessionFile: string | undefined,
): Promise<BatchDeleteResult> {
  const result: BatchDeleteResult = {
    deleted: [],
    failed: [],
    methods: {
      trash: 0,
      unlink: 0,
    },
  };

  for (const session of selectedSessions) {
    if (currentSessionFile && session.path === currentSessionFile) {
      result.failed.push({
        session,
        error: "Refused to delete the currently active session.",
      });
      continue;
    }

    try {
      const deleteResult = await deleteSessionFile(session.path);
      if (deleteResult.ok) {
        result.deleted.push(session);
        result.methods[deleteResult.method] += 1;
      } else {
        result.failed.push({
          session,
          error: deleteResult.error,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed.push({
        session,
        error: message,
      });
    }
  }

  return result;
}

function notifyDeleteOutcome(ctx: ExtensionCommandContext, result: BatchDeleteResult): void {
  const deletedCount = result.deleted.length;
  const failedCount = result.failed.length;

  if (deletedCount === 0 && failedCount > 0) {
    ctx.ui.notify(
      `No sessions were deleted.\n${summarizeFailures(result.failed)}`,
      "error",
    );
    return;
  }

  if (failedCount === 0) {
    ctx.ui.notify(
      `Deleted ${deletedCount} session(s) (trash: ${result.methods.trash}, permanent: ${result.methods.unlink}).`,
      "info",
    );
    return;
  }

  ctx.ui.notify(
    `Deleted ${deletedCount} session(s), but ${failedCount} failed.\n${summarizeFailures(result.failed)}`,
    "warning",
  );
}

export function getSessionCleanupArgumentCompletions(
  argumentPrefix: string,
): Array<{ value: string; label: string; description?: string }> | null {
  const normalizedPrefix = argumentPrefix.trim().toLowerCase();
  if (!normalizedPrefix) {
    return [...ARG_COMPLETIONS];
  }

  const matched = ARG_COMPLETIONS.filter((item) =>
    item.value.startsWith(normalizedPrefix),
  );
  if (matched.length === 0) {
    return null;
  }

  return matched.map((item) => ({ ...item }));
}

export async function handleSessionCleanupCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.help) {
    ctx.ui.notify(usage(), "info");
    return;
  }

  if (parsed.error) {
    ctx.ui.notify(`${parsed.error}\n${usage()}`, "warning");
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(`/${SESSION_CLEANUP_COMMAND} requires interactive TUI mode.`, "warning");
    return;
  }

  const currentSessionFile = ctx.sessionManager.getSessionFile();

  while (true) {
    let sessions: SessionCleanupSession[];
    try {
      sessions = await loadSessions(ctx, parsed.scope);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.ui.notify(`Failed to load sessions: ${message}`, "error");
      return;
    }

    const candidates = sessions.filter(
      (session) => session.path !== currentSessionFile,
    );

    if (candidates.length === 0) {
      ctx.ui.notify(
        "No deletable sessions found for this scope (current active session is excluded).",
        "info",
      );
      return;
    }

    const selection = await selectSessionsForCleanup(ctx, candidates);
    if (selection.cancelled) {
      ctx.ui.notify("Session cleanup cancelled.", "info");
      return;
    }

    if (selection.refreshRequested) {
      continue;
    }

    const selectedSessions = candidates.filter((session) =>
      selection.selectedPaths.has(session.path),
    );

    if (selectedSessions.length === 0) {
      ctx.ui.notify("No sessions selected. Select one or more sessions first.", "warning");
      continue;
    }

    const confirmed = await ctx.ui.confirm(
      "Delete selected sessions",
      buildConfirmationMessage(selectedSessions),
    );

    if (!confirmed) {
      ctx.ui.notify("Delete cancelled.", "info");
      return;
    }

    const deleteResult = await deleteSelectedSessions(
      selectedSessions,
      currentSessionFile,
    );
    notifyDeleteOutcome(ctx, deleteResult);
    return;
  }
}
