declare namespace NodeJS {
  interface Process {
    env: Record<string, string | undefined>;
    platform: string;
    stdout: {
      columns?: number;
      rows?: number;
    };
  }
}

declare const process: NodeJS.Process;

declare module "node:assert/strict" {
  const assert: {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };

  export default assert;
}

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: Record<string, unknown>,
  ): {
    status: number | null;
    stderr?: unknown;
    error?: Error;
  };
}

declare module "node:fs" {
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function writeFileSync(path: string, data: string, encoding: string): void;
}

declare module "node:fs/promises" {
  export function readFile(path: string, encoding: string): Promise<string>;
  export function unlink(path: string): Promise<void>;
}

declare module "node:os" {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module "node:path" {
  export function basename(path: string): string;
  export function dirname(path: string): string;
  export function join(...parts: string[]): string;
}

declare module "node:test" {
  const test: (
    name: string,
    fn: (context?: unknown) => void | Promise<void>,
  ) => void;

  export default test;
}

declare module "node:url" {
  export function fileURLToPath(url: unknown): string;
}

declare module "@mariozechner/pi-tui" {
  export interface Component {
    render(width: number): string[];
    handleInput(data: string): void;
    invalidate?(): void;
  }

  export function matchesKey(data: string, key: string): boolean;
  export function truncateToWidth(
    text: string,
    width: number,
    ellipsis?: string,
    trimWhitespace?: boolean,
  ): string;
  export function visibleWidth(text: string): number;
}

declare module "@mariozechner/pi-coding-agent" {
  import type { Component } from "@mariozechner/pi-tui";

  export interface SessionInfo {
    path: string;
    id: string;
    cwd: string;
    name?: string;
    parentSessionPath?: string;
    created: Date;
    modified: Date;
    messageCount: number;
    firstMessage: string;
    allMessagesText: string;
  }

  export class SessionManager {
    static list(cwd: string, sessionDir: string): Promise<SessionInfo[]>;
    static listAll(): Promise<SessionInfo[]>;
    getSessionId(): string;
    getSessionFile(): string | undefined;
    getCwd(): string;
    getSessionDir(): string;
    getEntries(): unknown[];
    getSessionName(): string | undefined;
  }

  export interface Theme {
    fg?(color: string, text: string): string;
    bold?(text: string): string;
  }

  export interface ExtensionUIContext {
    select(title: string, options: string[]): Promise<string | undefined>;
    confirm(title: string, message: string): Promise<boolean>;
    notify(message: string, type?: "info" | "warning" | "error"): void;
    custom<T>(
      factory: (
        tui: { requestRender(): void },
        theme: Theme,
        keybindings: unknown,
        done: (result?: T) => void,
      ) => Component,
      options?: Record<string, unknown>,
    ): Promise<T>;
  }

  export interface ExtensionContext {
    hasUI: boolean;
    cwd: string;
    sessionManager: SessionManager;
    ui: ExtensionUIContext;
    getSystemPrompt(): string;
  }

  export interface ExtensionCommandContext extends ExtensionContext {
    newSession(options?: {
      parentSession?: string;
      setup?: (sessionManager: SessionManager) => Promise<void>;
    }): Promise<{ cancelled: boolean }>;
    reload(): Promise<void>;
  }

  export interface ResourcesDiscoverEvent {
    type: "resources_discover";
    cwd: string;
    reason: "startup" | "reload";
  }

  export interface SessionStartEvent {
    type: "session_start";
    cwd: string;
    reason: "new" | "resume" | "fork" | "reload";
  }

  export interface ExtensionAPI {
    on(
      event: "resources_discover",
      handler: (event: ResourcesDiscoverEvent) => void | Promise<void>,
    ): void;
    on(
      event: "session_start",
      handler: (event: SessionStartEvent, ctx: ExtensionContext) => void | Promise<void>,
    ): void;

    registerCommand(
      name: string,
      definition: {
        description: string;
        getArgumentCompletions?: (
          argumentPrefix: string,
        ) => Array<{ value: string; label: string; description?: string }> | null;
        handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> | void;
      },
    ): void;

    sendUserMessage(
      content: string,
      options?: { deliverAs?: "steer" | "followUp" },
    ): void;
  }
}