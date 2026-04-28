import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";

import type { DeleteSessionResult } from "./types.js";

function buildTrashErrorHint(result: ReturnType<typeof spawnSync>): string | null {
  const details: string[] = [];

  if (result.error) {
    details.push(result.error.message);
  }

  const stderr = result.stderr?.toString().trim();
  if (stderr) {
    details.push(stderr.split("\n")[0] ?? stderr);
  }

  if (details.length === 0) {
    return null;
  }

  return `trash: ${details.join(" · ").slice(0, 200)}`;
}

/**
 * Mirrors Pi's built-in behavior: try moving to trash first, then fallback to unlink.
 */
export async function deleteSessionFile(sessionPath: string): Promise<DeleteSessionResult> {
  const trashArgs = sessionPath.startsWith("-") ? ["--", sessionPath] : [sessionPath];
  const trashResult = spawnSync("trash", trashArgs, { encoding: "utf-8" });

  if (trashResult.status === 0 || !existsSync(sessionPath)) {
    return { ok: true, method: "trash" };
  }

  try {
    await unlink(sessionPath);
    return { ok: true, method: "unlink" };
  } catch (error) {
    const unlinkError = error instanceof Error ? error.message : String(error);
    const trashHint = buildTrashErrorHint(trashResult);

    return {
      ok: false,
      method: "unlink",
      error: trashHint ? `${unlinkError} (${trashHint})` : unlinkError,
    };
  }
}
