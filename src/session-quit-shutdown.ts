import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { deleteSessionFile } from "./session-delete.js";
import { getErrorMessage } from "./error-utils.js";

const pendingSessionFilesForQuitDeletion = new Set<string>();

export function scheduleSessionDeletionForQuit(sessionFile: string | undefined): void {
  if (sessionFile) pendingSessionFilesForQuitDeletion.add(sessionFile);
}

export function clearScheduledSessionDeletionForQuit(sessionFile: string | undefined): void {
  if (sessionFile) pendingSessionFilesForQuitDeletion.delete(sessionFile);
}

export async function flushScheduledSessionDeletionForQuit(
  ctx: ExtensionContext,
): Promise<void> {
  const sessionFile = ctx.sessionManager.getSessionFile();
  // One process can host several sessions. Only the session that requested
  // deletion may consume its pending request, including during idle shutdown.
  if (!sessionFile || !pendingSessionFilesForQuitDeletion.delete(sessionFile)) {
    return;
  }

  try {
    const deleteResult = await deleteSessionFile(sessionFile);
    if (!deleteResult.ok) {
      ctx.ui.notify(
        `Failed to delete the current session during shutdown: ${deleteResult.error}`,
        "warning",
      );
    }
  } catch (error) {
    ctx.ui.notify(
      `Failed to delete the current session during shutdown: ${getErrorMessage(error)}`,
      "warning",
    );
  }
}
