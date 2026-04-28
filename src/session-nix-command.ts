import { basename } from "node:path";

import type { ExtensionCommandContext } from "@mariozechner/pi-coding-agent";

import { SESSION_NIX_COMMAND } from "./constants.js";
import { deleteSessionFile } from "./session-delete.js";

function usage(): string {
  return `Usage: /${SESSION_NIX_COMMAND}`;
}

function getSessionLabel(sessionPath: string): string {
  const fileName = basename(sessionPath).trim();
  return fileName.length > 0 ? fileName : sessionPath;
}

function buildConfirmationMessage(previousSessionFile: string | undefined): string {
  if (!previousSessionFile) {
    return "This will start a new session. The current session is not persisted yet, so there is no session file to delete.";
  }

  return [
    "This will start a new session and permanently remove the current session from your session history.",
    "",
    `Current session: ${getSessionLabel(previousSessionFile)}`,
    "",
    "Pi will try moving it to trash first, then permanently delete it if trash is unavailable.",
  ].join("\n");
}

export async function handleSessionNixCommand(
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const normalizedArgs = args.trim();
  if (normalizedArgs.toLowerCase() === "help") {
    ctx.ui.notify(usage(), "info");
    return;
  }

  if (normalizedArgs.length > 0) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} does not accept arguments.\n${usage()}`, "warning");
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} requires interactive TUI mode.`, "warning");
    return;
  }

  const previousSessionFile = ctx.sessionManager.getSessionFile();
  const confirmed = await ctx.ui.confirm(
    "Start fresh and delete current session",
    buildConfirmationMessage(previousSessionFile),
  );

  if (!confirmed) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} cancelled.`, "info");
    return;
  }

  try {
    const newSessionResult = await ctx.newSession();
    if (newSessionResult.cancelled) {
      ctx.ui.notify("New session cancelled.", "info");
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`Failed to start a new session: ${message}`, "error");
    return;
  }

  // After successful ctx.newSession(), ctx is stale. Do NOT call ctx.ui.notify() below.
  if (!previousSessionFile) {
    return;
  }

  try {
    await deleteSessionFile(previousSessionFile);
  } catch {
    // Deletion failure is non-critical; the session was already replaced.
  }
}
