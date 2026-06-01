import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { SESSION_CLEANUP_COMMAND, SESSION_NIX_COMMAND } from "./constants.js";
import { flushScheduledSessionDeletionForQuit } from "./session-quit-shutdown.js";

type SessionCleanupCommandModule = typeof import("./session-cleanup-command.js");
type SessionNixCommandModule = typeof import("./session-nix-command.js");
type CommandCompletion = {
  value: string;
  label: string;
  description?: string;
};

const SESSION_CLEANUP_ARGUMENT_COMPLETIONS = [
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
] as const satisfies readonly CommandCompletion[];

const SESSION_NIX_ARGUMENT_COMPLETIONS = [
  {
    value: "quit",
    label: "quit",
    description: "Delete the current session and quit Pi immediately",
  },
  {
    value: "agent",
    label: "agent",
    description: "Start a fresh session with a selected target agent",
  },
  {
    value: "help",
    label: "help",
    description: "Show usage",
  },
] as const satisfies readonly CommandCompletion[];

let sessionCleanupCommandModule: SessionCleanupCommandModule | undefined;
let sessionCleanupCommandModulePromise: Promise<SessionCleanupCommandModule> | undefined;
let sessionNixCommandModule: SessionNixCommandModule | undefined;
let sessionNixCommandModulePromise: Promise<SessionNixCommandModule> | undefined;

function loadSessionCleanupCommandModule(): Promise<SessionCleanupCommandModule> {
  if (sessionCleanupCommandModule) {
    return Promise.resolve(sessionCleanupCommandModule);
  }

  sessionCleanupCommandModulePromise ??= import("./session-cleanup-command.js").then(
    (module) => {
      sessionCleanupCommandModule = module;
      return module;
    },
  );
  return sessionCleanupCommandModulePromise;
}

function loadSessionNixCommandModule(): Promise<SessionNixCommandModule> {
  if (sessionNixCommandModule) {
    return Promise.resolve(sessionNixCommandModule);
  }

  sessionNixCommandModulePromise ??= import("./session-nix-command.js").then(
    (module) => {
      sessionNixCommandModule = module;
      return module;
    },
  );
  return sessionNixCommandModulePromise;
}

function getMatchedCompletions(
  argumentPrefix: string,
  completions: readonly CommandCompletion[],
): CommandCompletion[] | null {
  const normalizedPrefix = argumentPrefix.trim().toLowerCase();
  if (!normalizedPrefix) {
    return completions.map((completion) => ({ ...completion }));
  }

  const matched = completions.filter((completion) =>
    completion.value.startsWith(normalizedPrefix),
  );
  if (matched.length === 0) {
    return null;
  }

  return matched.map((completion) => ({ ...completion }));
}

export default function sessionCleanupExtension(pi: ExtensionAPI): void {
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
