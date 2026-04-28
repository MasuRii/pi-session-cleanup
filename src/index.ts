import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { SESSION_CLEANUP_COMMAND, SESSION_NIX_COMMAND } from "./constants.js";
import {
  getSessionCleanupArgumentCompletions,
  handleSessionCleanupCommand,
} from "./session-cleanup-command.js";
import { handleSessionNixCommand } from "./session-nix-command.js";

export default function sessionCleanupExtension(pi: ExtensionAPI): void {
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
      "Start a new session and automatically delete the previous session.",
    handler: async (args, ctx) => {
      await handleSessionNixCommand(args, ctx);
    },
  });
}
