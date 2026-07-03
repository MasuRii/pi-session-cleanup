import { basename } from "node:path";

import type { ExtensionCommandContext, SessionManager } from "@earendil-works/pi-coding-agent";

import { SESSION_NIX_COMMAND } from "./constants.js";
import {
  getMatchedCompletions,
  SESSION_NIX_ARGUMENT_COMPLETIONS,
  type CommandCompletion,
} from "./argument-completions.js";
import {
  resolveTargetAgentForSessionNix,
  type SelectableAgent,
} from "./agent-target.js";
import { extractPersistedActiveAgentNameFromEntries } from "./session-agent.js";
import { deleteSessionFile } from "./session-delete.js";
import { appendActiveAgentSessionEntry } from "./session-entry.js";
import { getErrorMessage } from "./error-utils.js";
import {
  clearScheduledSessionDeletionForQuit,
  scheduleSessionDeletionForQuit,
} from "./session-quit-shutdown.js";

type NixMode = "fresh" | "quit" | "agent";

interface ParsedArgs {
  help: boolean;
  mode: NixMode;
  targetAgentName?: string;
  error?: string;
}

type DeleteSessionFileFn = typeof deleteSessionFile;

interface SessionNixCommandOptions {
  deleteSessionFile?: DeleteSessionFileFn;
}

function nixUsage(): string {
  return [
    `Usage: /${SESSION_NIX_COMMAND}`,
    `       /${SESSION_NIX_COMMAND} quit`,
    `       /${SESSION_NIX_COMMAND} agent [name]`,
    `       /${SESSION_NIX_COMMAND} help`,
  ].join("\n");
}

function getSessionLabel(sessionPath: string): string {
  const fileName = basename(sessionPath).trim();
  return fileName.length > 0 ? fileName : sessionPath;
}

function parseNixArgs(args: string): ParsedArgs {
  const trimmed = args.trim();
  if (!trimmed) {
    return { help: false, mode: "fresh" };
  }

  const parts = trimmed.split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command) {
    return { help: false, mode: "fresh" };
  }

  if (command === "help") {
    return { help: true, mode: "fresh" };
  }

  if (command === "quit" || command === "exit") {
    return parts.length === 1
      ? { help: false, mode: "quit" }
      : {
          help: false,
          mode: "quit",
          error: `/${SESSION_NIX_COMMAND} quit does not accept additional arguments.`,
        };
  }

  if (command === "agent") {
    return {
      help: false,
      mode: "agent",
      targetAgentName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
    };
  }

  return {
    help: false,
    mode: "fresh",
    error: `Unknown argument: ${trimmed}`,
  };
}

function buildSimpleConfirmationMessage(
  previousSessionFile: string | undefined,
  noSessionMessage: string,
  introMessage: string,
): string {
  if (!previousSessionFile) {
    return noSessionMessage;
  }

  return [
    introMessage,
    "",
    `Current session: ${getSessionLabel(previousSessionFile)}`,
    "",
    "Pi will try moving it to trash first, then permanently delete it if trash is unavailable.",
  ].join("\n");
}

function buildFreshConfirmationMessage(previousSessionFile: string | undefined): string {
  return buildSimpleConfirmationMessage(
    previousSessionFile,
    "This will start a new session. The current session is not persisted yet, so there is no session file to delete.",
    "This will start a new session and permanently remove the current session from your session history.",
  );
}

function buildQuitConfirmationMessage(previousSessionFile: string | undefined): string {
  return buildSimpleConfirmationMessage(
    previousSessionFile,
    "This will quit Pi immediately. The current session is not persisted yet, so there is no session file to delete first.",
    "This will permanently remove the current session and then quit Pi immediately.",
  );
}

function buildAgentConfirmationMessage(
  previousSessionFile: string | undefined,
  targetAgent: SelectableAgent,
): string {
  if (!previousSessionFile) {
    return [
      `This will start a new session with agent '${targetAgent.name}'.`,
      "",
      "The current session is not persisted yet, so there is no session file to delete.",
    ].join("\n");
  }

  return [
    `This will start a new session with agent '${targetAgent.name}' and remove the current session from history.`,
    "",
    `Current session: ${getSessionLabel(previousSessionFile)}`,
    `Target agent: ${targetAgent.name}`,
    "",
    "Pi will try moving the old session to trash first, then permanently delete it if trash is unavailable.",
  ].join("\n");
}

export function getSessionNixArgumentCompletions(
  argumentPrefix: string,
): CommandCompletion[] | null {
  return getMatchedCompletions(argumentPrefix, SESSION_NIX_ARGUMENT_COMPLETIONS);
}

async function deletePreviousSessionAfterSwitch(
  ctx: ExtensionCommandContext,
  previousSessionFile: string | undefined,
  deleteSessionFileFn: DeleteSessionFileFn,
): Promise<void> {
  if (!previousSessionFile) {
    return;
  }

  try {
    const deleteResult = await deleteSessionFileFn(previousSessionFile);
    if (!deleteResult.ok) {
      ctx.ui.notify(
        `Failed to delete the previous session after starting the new session: ${deleteResult.error}`,
        "warning",
      );
    }
  } catch (error) {
    ctx.ui.notify(
      `Failed to delete the previous session after starting the new session: ${getErrorMessage(error)}`,
      "warning",
    );
  }
}

async function startNewSession(
  ctx: ExtensionCommandContext,
  setup: ((sessionManager: SessionManager) => Promise<void>) | undefined,
  failureMessagePrefix: string,
): Promise<{ cancelled: boolean }> {
  try {
    const newSessionResult = await ctx.newSession(
      setup ? { setup } : undefined,
    );
    if (newSessionResult.cancelled) {
      ctx.ui.notify("New session cancelled.", "info");
      return { cancelled: true };
    }
    return { cancelled: false };
  } catch (error) {
    ctx.ui.notify(`${failureMessagePrefix}: ${getErrorMessage(error)}`, "error");
    return { cancelled: true };
  }
}

async function startFreshSession(
  ctx: ExtensionCommandContext,
  previousSessionFile: string | undefined,
  deleteSessionFileFn: DeleteSessionFileFn,
): Promise<void> {
  const result = await startNewSession(ctx, undefined, "Failed to start a new session");
  if (result.cancelled) {
    return;
  }

  await deletePreviousSessionAfterSwitch(ctx, previousSessionFile, deleteSessionFileFn);
}

async function startAgentTargetSession(
  ctx: ExtensionCommandContext,
  previousSessionFile: string | undefined,
  targetAgent: SelectableAgent,
  deleteSessionFileFn: DeleteSessionFileFn,
): Promise<void> {
  const result = await startNewSession(
    ctx,
    async (sessionManager) => appendActiveAgentSessionEntry(sessionManager, targetAgent.name),
    `Failed to start a new session for agent '${targetAgent.name}'`,
  );
  if (result.cancelled) {
    return;
  }

  await deletePreviousSessionAfterSwitch(ctx, previousSessionFile, deleteSessionFileFn);
}

async function requestGracefulQuit(
  ctx: ExtensionCommandContext,
  previousSessionFile: string | undefined,
): Promise<void> {
  const shutdown = (ctx as ExtensionCommandContext & {
    shutdown?: () => Promise<void> | void;
  }).shutdown;

  if (typeof shutdown !== "function") {
    ctx.ui.notify(
      "Graceful shutdown is unavailable in this Pi build. Update Pi to use /nix quit safely.",
      "warning",
    );
    return;
  }

  scheduleSessionDeletionForQuit(previousSessionFile);

  try {
    await Promise.resolve(shutdown.call(ctx));
  } catch (error) {
    clearScheduledSessionDeletionForQuit();
    ctx.ui.notify(`Failed to quit Pi gracefully: ${getErrorMessage(error)}`, "error");
  }
}

export async function handleSessionNixCommand(
  args: string,
  ctx: ExtensionCommandContext,
  options: SessionNixCommandOptions = {},
): Promise<void> {
  const parsed = parseNixArgs(args);
  if (parsed.help) {
    ctx.ui.notify(nixUsage(), "info");
    return;
  }

  if (parsed.error) {
    ctx.ui.notify(`${parsed.error}\n${nixUsage()}`, "warning");
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} requires interactive TUI mode.`, "warning");
    return;
  }

  const previousSessionFile = ctx.sessionManager.getSessionFile();
  const deleteSessionFileFn = options.deleteSessionFile ?? deleteSessionFile;

  if (parsed.mode === "fresh") {
    const confirmed = await ctx.ui.confirm(
      "Start fresh and delete current session",
      buildFreshConfirmationMessage(previousSessionFile),
    );

    if (!confirmed) {
      ctx.ui.notify(`/${SESSION_NIX_COMMAND} cancelled.`, "info");
      return;
    }

    await startFreshSession(ctx, previousSessionFile, deleteSessionFileFn);
    return;
  }

  if (parsed.mode === "quit") {
    const confirmed = await ctx.ui.confirm(
      "Delete current session and quit Pi",
      buildQuitConfirmationMessage(previousSessionFile),
    );

    if (!confirmed) {
      ctx.ui.notify(`/${SESSION_NIX_COMMAND} quit cancelled.`, "info");
      return;
    }

    await requestGracefulQuit(ctx, previousSessionFile);
    return;
  }

  const currentAgentName =
    extractPersistedActiveAgentNameFromEntries(ctx.sessionManager.getEntries()) ?? null;
  const targetAgent = await resolveTargetAgentForSessionNix(
    ctx,
    parsed.targetAgentName,
    currentAgentName,
  );

  if (targetAgent === null) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} agent cancelled.`, "info");
    return;
  }

  if (!targetAgent) {
    return;
  }

  const confirmed = await ctx.ui.confirm(
    `Start a new '${targetAgent.name}' session`,
    buildAgentConfirmationMessage(previousSessionFile, targetAgent),
  );

  if (!confirmed) {
    ctx.ui.notify(`/${SESSION_NIX_COMMAND} agent cancelled.`, "info");
    return;
  }

  await startAgentTargetSession(ctx, previousSessionFile, targetAgent, deleteSessionFileFn);
}
