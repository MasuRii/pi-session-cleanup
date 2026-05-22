import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { SESSION_CLEANUP_COMMAND, SESSION_NIX_COMMAND } from "./constants.js";
import {
  getSessionCleanupArgumentCompletions,
  handleSessionCleanupCommand,
} from "./session-cleanup-command.js";
import {
  getSessionNixArgumentCompletions,
  handleSessionNixCommand,
} from "./session-nix-command.js";
import { flushScheduledSessionDeletionForQuit } from "./session-quit-shutdown.js";

export default function sessionCleanupExtension(pi: ExtensionAPI): void {
  pi.on("session_shutdown", async (_event, ctx) => {
    await flushScheduledSessionDeletionForQuit(ctx);
  });

  pi.registerCommand(SESSION_CLEANUP_COMMAND, {
    description:
      "Batch-select previous sessions and delete them with confirmation.",
    getArgumentCompletions: getSessionCleanupArgumentCompletions,
    handler: async (args, ctx) => {
      await handleSessionCleanupCommand(args, ctx);
    },
  });

  pi.registerCommand(SESSION_NIX_COMMAND, {
    description:
      "Start a fresh session, switch to a target agent, or delete the current session and quit Pi.",
    getArgumentCompletions: getSessionNixArgumentCompletions,
    handler: async (args, ctx) => {
      await handleSessionNixCommand(args, ctx);
    },
  });
}
