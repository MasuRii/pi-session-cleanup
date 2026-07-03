import { readFile } from "node:fs/promises";

import type { SessionInfo } from "@earendil-works/pi-coding-agent";

import { toRecord } from "./record-utils.js";
import type { SessionCleanupSession } from "./types.js";

function normalizeAgentName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseJsonLine(value: string): Record<string, unknown> | null {
  try {
    return toRecord(JSON.parse(value));
  } catch {
    return null;
  }
}

function extractAgentNameFromEntry(
  entry: unknown,
  continueOnInvalidName: boolean,
): string | null | undefined {
  const record = toRecord(entry);
  if (!record || record.type !== "custom" || record.customType !== "active_agent") {
    return undefined;
  }

  const data = toRecord(record.data);
  const normalizedAgentName = normalizeAgentName(data?.name);
  if (normalizedAgentName) {
    return normalizedAgentName;
  }

  if (data?.name === null) {
    return null;
  }

  return continueOnInvalidName ? undefined : null;
}

export function extractResponsibleAgentNameFromContent(content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index]?.trim();
    if (!trimmed) {
      continue;
    }

    const entry = parseJsonLine(trimmed);
    if (!entry) {
      continue;
    }

    const agentName = extractAgentNameFromEntry(entry, true);
    if (agentName !== undefined) {
      return agentName;
    }
  }

  return null;
}

export async function resolveResponsibleAgentName(sessionPath: string): Promise<string | null> {
  if (typeof sessionPath !== "string" || sessionPath.trim().length === 0) {
    return null;
  }

  try {
    const content = await readFile(sessionPath, "utf8");
    return extractResponsibleAgentNameFromContent(content);
  } catch {
    return null;
  }
}

export function extractPersistedActiveAgentNameFromEntries(
  entries: readonly unknown[],
): string | null | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const agentName = extractAgentNameFromEntry(entries[index], false);
    if (agentName !== undefined) {
      return agentName;
    }
  }

  return undefined;
}

export async function enrichSessionWithResponsibleAgent(
  session: SessionInfo,
): Promise<SessionCleanupSession> {
  const responsibleAgentName = await resolveResponsibleAgentName(session.path);

  return {
    ...session,
    responsibleAgentName,
  };
}
