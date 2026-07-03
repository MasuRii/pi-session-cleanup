export function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function parseEnumString<
  TAllowed extends string,
  TResult,
>(
  value: unknown,
  allowed: readonly TAllowed[],
  notFoundResult: TResult,
): TAllowed | TResult {
  if (typeof value !== "string") {
    return notFoundResult;
  }

  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized as TAllowed)
    ? (normalized as TAllowed)
    : notFoundResult;
}
