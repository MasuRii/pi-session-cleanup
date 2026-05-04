import { readFile } from "node:fs/promises";

import type { SessionInfo } from "@mariozechner/pi-coding-agent";

import type { SessionCleanupSession } from "./types.js";

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

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

export function extractResponsibleAgentNameFromContent(content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const trimmed = lines[index]?.trim();
    if (!trimmed) {
      continue;
    }

    const entry = parseJsonLine(trimmed);
    if (!entry || entry.type !== "custom" || entry.customType !== "active_agent") {
      continue;
    }

    const data = toRecord(entry.data);
    const normalizedAgentName = normalizeAgentName(data?.name);
    if (normalizedAgentName) {
      return normalizedAgentName;
    }

    if (data?.name === null) {
      return null;
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
    const entry = toRecord(entries[index]);
    if (!entry || entry.type !== "custom" || entry.customType !== "active_agent") {
      continue;
    }

    const data = toRecord(entry.data);
    const normalizedAgentName = normalizeAgentName(data?.name);
    if (normalizedAgentName) {
      return normalizedAgentName;
    }

    if (data?.name === null) {
      return null;
    }

    return null;
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
