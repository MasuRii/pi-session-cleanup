import {
  SessionManager,
  type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

import { enrichSessionWithResponsibleAgent } from "./session-agent.js";
import { sortSessionsNewestFirst } from "./session-sort.js";
import type { SessionCleanupSession, SessionScope } from "./types.js";

function ensureSessionArray(value: unknown): SessionCleanupSession[] {
  if (!Array.isArray(value)) {
    throw new Error("Session manager returned a non-array response.");
  }

  return value as SessionCleanupSession[];
}

export async function loadSessions(
  ctx: ExtensionCommandContext,
  scope: SessionScope,
): Promise<SessionCleanupSession[]> {
  const loaded =
    scope === "all"
      ? await SessionManager.listAll()
      : await SessionManager.list(
          ctx.sessionManager.getCwd(),
          ctx.sessionManager.getSessionDir(),
        );

  const sortedSessions = sortSessionsNewestFirst(ensureSessionArray(loaded));
  return Promise.all(sortedSessions.map((session) => enrichSessionWithResponsibleAgent(session)));
}
