/**
 * Shared error-message extraction for the pi-session-cleanup extension.
 *
 * Consolidates the repeated `error instanceof Error ? error.message : String(error)`
 * coercion that previously lived inline in every command and lifecycle catch
 * block, so callers share one consistent error-description path.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
