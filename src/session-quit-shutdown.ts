import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { deleteSessionFile } from "./session-delete.js";

let pendingSessionFileForQuitDeletion: string | undefined;

export function scheduleSessionDeletionForQuit(sessionFile: string | undefined): void {
  pendingSessionFileForQuitDeletion = sessionFile;
}

export function clearScheduledSessionDeletionForQuit(): void {
  pendingSessionFileForQuitDeletion = undefined;
}

export async function flushScheduledSessionDeletionForQuit(
  ctx: ExtensionContext,
): Promise<void> {
  const sessionFile = pendingSessionFileForQuitDeletion;
  pendingSessionFileForQuitDeletion = undefined;

  if (!sessionFile) {
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
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(
      `Failed to delete the current session during shutdown: ${message}`,
      "warning",
    );
  }
}
