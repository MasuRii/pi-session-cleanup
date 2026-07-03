import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";

import type { DeleteSessionResult } from "./types.js";
import { getErrorMessage } from "./error-utils.js";

const TRASH_PROVIDER_TIMEOUT_MS = 5_000;
const TRASH_PROVIDER_MAX_STDERR_BYTES = 64 * 1024;

interface TrashProcessResult {
  status: number | null;
  stderr?: string;
  error?: Error;
}

type TrashProcessRunner = (
  command: string,
  args: readonly string[],
  options: { timeout: number; maxStderrBytes: number },
) => Promise<TrashProcessResult>;

interface TrashProvider {
  name: string;
  command: string;
  getArgs: (sessionPath: string) => string[];
}

export interface DeleteSessionFileOptions {
  spawn?: TrashProcessRunner;
  existsSync?: (path: string) => boolean;
  unlink?: (path: string) => Promise<void>;
}

function argsWithDashSafety(prefix: string[], sessionPath: string, suffix: string[] = []): string[] {
  const pathArgs = sessionPath.startsWith("-") ? ["--", sessionPath] : [sessionPath];
  return [...prefix, ...pathArgs, ...suffix];
}

const TRASH_PROVIDERS: readonly TrashProvider[] = [
  {
    name: "trash",
    command: "trash",
    getArgs: (sessionPath) => argsWithDashSafety([], sessionPath),
  },
  {
    name: "trash-put",
    command: "trash-put",
    getArgs: (sessionPath) => argsWithDashSafety([], sessionPath),
  },
  {
    name: "gio trash",
    command: "gio",
    getArgs: (sessionPath) => argsWithDashSafety(["trash"], sessionPath),
  },
  {
    name: "kioclient5 move",
    command: "kioclient5",
    getArgs: (sessionPath) => argsWithDashSafety(["move"], sessionPath, ["trash:/"]),
  },
  {
    name: "kioclient move",
    command: "kioclient",
    getArgs: (sessionPath) => argsWithDashSafety(["move"], sessionPath, ["trash:/"]),
  },
];

function buildTrashErrorHint(providerName: string, result: TrashProcessResult): string | null {
  const details: string[] = [];

  if (result.error) {
    details.push(result.error.message);
  }

  const stderr = result.stderr?.trim();
  if (stderr) {
    details.push(stderr.split("\n")[0] ?? stderr);
  }

  if (details.length === 0) {
    return null;
  }

  return `${providerName}: ${details.join(" · ").slice(0, 200)}`;
}

function runTrashProcess(
  command: string,
  args: readonly string[],
  options: { timeout: number; maxStderrBytes: number },
): Promise<TrashProcessResult> {
  return new Promise((resolve) => {
    const allowedTrashCommands = new Set(TRASH_PROVIDERS.map((provider) => provider.command));
    if (!allowedTrashCommands.has(command)) {
      resolve({
        status: null,
        error: new Error(`Trash command is not allowlisted: ${command}`),
      });
      return;
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, [...args], { // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process -- command is checked against the hardcoded TRASH_PROVIDERS command list above; args are provider-generated arrays and shell is disabled.
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        status: null,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }

    const stderrChunks: Buffer[] = [];
    let stderrBytes = 0;
    let processError: Error | undefined;
    let settled = false;

    const finish = (result: TrashProcessResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const failAndKill = (error: Error): void => {
      if (!processError) {
        processError = error;
      }
      child.kill();
    };

    const timeout = setTimeout(() => {
      failAndKill(new Error(`Trash provider timed out after ${options.timeout}ms.`));
    }, options.timeout);
    timeout.unref?.();

    child.stderr?.on("data", (chunk: unknown) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      stderrBytes += buffer.length;
      if (stderrBytes > options.maxStderrBytes) {
        failAndKill(new Error(`Trash provider stderr exceeded ${options.maxStderrBytes} bytes.`));
        return;
      }

      stderrChunks.push(buffer);
    });

    child.on("error", (error: Error) => {
      processError = error;
      finish({
        status: null,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: processError,
      });
    });

    child.on("close", (status: number | null) => {
      finish({
        status,
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        error: processError,
      });
    });
  });
}

/**
 * Mirrors Pi's built-in behavior: try moving to trash first, then fallback to unlink.
 */
export async function deleteSessionFile(
  sessionPath: string,
  options: DeleteSessionFileOptions = {},
): Promise<DeleteSessionResult> {
  const runProcess = options.spawn ?? runTrashProcess;
  const pathExists = options.existsSync ?? existsSync;
  const unlinkFile = options.unlink ?? unlink;
  const trashHints: string[] = [];

  for (const provider of TRASH_PROVIDERS) {
    const result = await runProcess(provider.command, provider.getArgs(sessionPath), {
      timeout: TRASH_PROVIDER_TIMEOUT_MS,
      maxStderrBytes: TRASH_PROVIDER_MAX_STDERR_BYTES,
    });

    if (result.status === 0 || !pathExists(sessionPath)) {
      return { ok: true, method: "trash" };
    }

    const hint = buildTrashErrorHint(provider.name, result);
    if (hint) {
      trashHints.push(hint);
    }
  }

  try {
    await unlinkFile(sessionPath);
    return { ok: true, method: "unlink" };
  } catch (error) {
    const unlinkError = getErrorMessage(error);
    const trashHint = trashHints.length > 0 ? trashHints.join("; ") : null;

    return {
      ok: false,
      method: "unlink",
      error: trashHint ? `${unlinkError} (${trashHint})` : unlinkError,
    };
  }
}
