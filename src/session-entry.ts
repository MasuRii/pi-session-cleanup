import type { SessionManager } from "@earendil-works/pi-coding-agent";

export interface ActiveAgentSessionEntryData {
  name: string | null;
}

type SessionManagerWithCustomEntry = SessionManager & {
  appendCustomEntry?: (customType: string, data?: unknown) => string;
};

export function appendActiveAgentSessionEntry(
  sessionManager: SessionManager,
  agentName: string | null,
): void {
  const writableSessionManager = sessionManager as SessionManagerWithCustomEntry;
  if (typeof writableSessionManager.appendCustomEntry !== "function") {
    throw new Error("The current Pi build does not expose sessionManager.appendCustomEntry().");
  }

  writableSessionManager.appendCustomEntry("active_agent", {
    name: agentName,
  } satisfies ActiveAgentSessionEntryData);
}
