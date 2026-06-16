import { basename } from "node:path";

import type { SessionInfo } from "@earendil-works/pi-coding-agent";

function toTimestamp(value: unknown): number | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseEpochCandidate(token: string): number | null {
  if (!/^\d{10,17}$/.test(token)) {
    return null;
  }

  const numeric = Number(token);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  if (token.length <= 10) {
    return numeric * 1000;
  }

  return numeric;
}

function parseCalendarCandidate(path: string): number | null {
  const match = path.match(
    /(\d{4})[-_]?([01]\d)[-_]?([0-3]\d)(?:[tT _-]?([0-2]\d)[:_\-]?([0-5]\d)?[:_\-]?([0-5]\d)?)?/, 
  );

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? "0");
  const minute = Number(match[5] ?? "0");
  const second = Number(match[6] ?? "0");

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return null;
  }

  const utcTimestamp = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(utcTimestamp)) {
    return null;
  }

  const parsed = new Date(utcTimestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  ) {
    return null;
  }

  return utcTimestamp;
}

function timestampFromPath(sessionPath: string): number {
  const fileName = basename(sessionPath);
  const epochCandidates = fileName.match(/\d{10,17}/g) ?? [];

  let bestEpoch = 0;
  for (const candidate of epochCandidates) {
    const parsed = parseEpochCandidate(candidate);
    if (parsed && parsed > bestEpoch) {
      bestEpoch = parsed;
    }
  }

  if (bestEpoch > 0) {
    return bestEpoch;
  }

  const calendarTimestamp = parseCalendarCandidate(fileName);
  if (calendarTimestamp) {
    return calendarTimestamp;
  }

  return 0;
}

function compareDescending(left: number, right: number): number {
  if (left === right) {
    return 0;
  }

  return right - left;
}

export function sortSessionsNewestFirst(
  sessions: readonly SessionInfo[],
): SessionInfo[] {
  return [...sessions].sort((left, right) => {
    const modifiedOrder = compareDescending(
      toTimestamp(left.modified) ?? 0,
      toTimestamp(right.modified) ?? 0,
    );
    if (modifiedOrder !== 0) {
      return modifiedOrder;
    }

    const createdOrder = compareDescending(
      toTimestamp(left.created) ?? 0,
      toTimestamp(right.created) ?? 0,
    );
    if (createdOrder !== 0) {
      return createdOrder;
    }

    const pathOrder = compareDescending(
      timestampFromPath(left.path),
      timestampFromPath(right.path),
    );
    if (pathOrder !== 0) {
      return pathOrder;
    }

    return right.path.localeCompare(left.path);
  });
}
