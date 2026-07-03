import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { loadSessionCleanupConfig } from "./config-store.js";
import { SESSION_CLEANUP_COMMAND, SESSION_NIX_COMMAND } from "./constants.js";
import { flushScheduledSessionDeletionForQuit } from "./session-quit-shutdown.js";
import {
  getMatchedCompletions,
  SESSION_CLEANUP_ARGUMENT_COMPLETIONS,
  SESSION_NIX_ARGUMENT_COMPLETIONS,
} from "./argument-completions.js";

type SessionCleanupCommandModule = typeof import("./session-cleanup-command.js");
type SessionNixCommandModule = typeof import("./session-nix-command.js");

function createLazyModuleLoader<TModule>(
  importer: () => Promise<TModule>,
): () => Promise<TModule> {
  let cached: TModule | undefined;
  let pending: Promise<TModule> | undefined;

  return () => {
    if (cached) {
      return Promise.resolve(cached);
    }

    pending ??= importer().then((module) => {
      cached = module;
      return module;
    });
    return pending;
  };
}

const loadSessionCleanupCommandModule = createLazyModuleLoader<SessionCleanupCommandModule>(
  () => import("./session-cleanup-command.js"),
);
const loadSessionNixCommandModule = createLazyModuleLoader<SessionNixCommandModule>(
  () => import("./session-nix-command.js"),
);

export default function sessionCleanupExtension(pi: ExtensionAPI): void {
  if (!loadSessionCleanupConfig().enabled) {
    return;
  }

  pi.on("session_shutdown", async (_event, ctx) => {
    await flushScheduledSessionDeletionForQuit(ctx);
  });

  pi.registerCommand(SESSION_CLEANUP_COMMAND, {
    description:
      "Batch-select previous sessions and delete them with confirmation.",
    getArgumentCompletions: (argumentPrefix) =>
      getMatchedCompletions(argumentPrefix, SESSION_CLEANUP_ARGUMENT_COMPLETIONS),
    handler: async (args, ctx) => {
      const { handleSessionCleanupCommand } = await loadSessionCleanupCommandModule();
      await handleSessionCleanupCommand(args, ctx);
    },
  });

  pi.registerCommand(SESSION_NIX_COMMAND, {
    description:
      "Start a fresh session, switch to a target agent, or delete the current session and quit Pi.",
    getArgumentCompletions: (argumentPrefix) =>
      getMatchedCompletions(argumentPrefix, SESSION_NIX_ARGUMENT_COMPLETIONS),
    handler: async (args, ctx) => {
      const { handleSessionNixCommand } = await loadSessionNixCommandModule();
      await handleSessionNixCommand(args, ctx);
    },
  });
}
