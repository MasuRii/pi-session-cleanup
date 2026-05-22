import { homedir } from "node:os";

import type { SessionInfo } from "@earendil-works/pi-coding-agent";

const LABEL_MAX_TEXT = 56;

type SessionDisplayInfo = SessionInfo & {
  responsibleAgentName?: string | null;
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clipText(value: string, max = LABEL_MAX_TEXT): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

export function shortenPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }

  return path;
}

export function formatSessionAge(date: Date, now = Date.now()): string {
  const ageMs = Math.max(0, now - date.getTime());
  const minutes = Math.floor(ageMs / 60000);

  if (minutes < 1) {
    return "now";
  }

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }

  if (days < 30) {
    return `${Math.floor(days / 7)}w`;
  }

  if (days < 365) {
    return `${Math.floor(days / 30)}mo`;
  }

  return `${Math.floor(days / 365)}y`;
}

export function getSessionTitle(session: SessionInfo): string {
  const preferred = compactWhitespace(session.name ?? "");
  if (preferred) {
    return clipText(preferred);
  }

  const preview = compactWhitespace(session.firstMessage ?? "");
  if (preview) {
    return clipText(preview);
  }

  return "(no preview)";
}

export function getResponsibleAgentDisplayName(session: SessionDisplayInfo): string {
  const normalizedAgentName = compactWhitespace(session.responsibleAgentName ?? "");
  return normalizedAgentName || "unknown";
}

export function buildSessionSelectionLabel(
  session: SessionDisplayInfo,
  index: number,
  selected: boolean,
): string {
  const marker = selected ? "[x]" : "[ ]";
  const title = getSessionTitle(session);
  const agent = `@${getResponsibleAgentDisplayName(session)}`;
  const age = formatSessionAge(session.modified);
  const shortId = session.id.slice(0, 8);
  const cwd = shortenPath(session.cwd || "(unknown cwd)");
  const position = String(index + 1).padStart(3, "0");

  return `${position} ${marker} ${title} · ${agent} · ${age} · ${shortId} · ${cwd}`;
}
