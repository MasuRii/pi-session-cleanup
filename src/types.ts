import type { SessionInfo } from "@earendil-works/pi-coding-agent";

export type SessionScope = "current" | "all";

export type DeleteMethod = "trash" | "unlink";

export interface SessionCleanupSession extends SessionInfo {
  responsibleAgentName: string | null;
}

export interface DeleteSessionSuccess {
  ok: true;
  method: DeleteMethod;
}

export interface DeleteSessionFailure {
  ok: false;
  method: "unlink";
  error: string;
}

export type DeleteSessionResult = DeleteSessionSuccess | DeleteSessionFailure;

export interface DeleteFailureDetail {
  session: SessionInfo;
  error: string;
}

export interface BatchDeleteResult {
  deleted: SessionInfo[];
  failed: DeleteFailureDetail[];
  methods: Record<DeleteMethod, number>;
}

export interface SessionSelectionResult {
  cancelled: boolean;
  refreshRequested: boolean;
  selectedPaths: Set<string>;
}
