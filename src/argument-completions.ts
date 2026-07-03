export interface CommandCompletion {
  value: string;
  label: string;
  description?: string;
}

export const SESSION_CLEANUP_ARGUMENT_COMPLETIONS = [
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

export const SESSION_NIX_ARGUMENT_COMPLETIONS = [
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

export function getMatchedCompletions(
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
