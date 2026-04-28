import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type IconModePreference = "auto" | "nerd" | "fallback";

export interface SessionCleanupConfig {
  enabled: boolean;
  iconMode: IconModePreference;
}

const DEFAULT_CONFIG: SessionCleanupConfig = {
  enabled: true,
  iconMode: "auto",
};

function resolveExtensionRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

function parseIconMode(value: unknown): IconModePreference | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "nerd" || normalized === "fallback") {
    return normalized;
  }

  return null;
}

function readConfigFile(configPath: string): Record<string, unknown> | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to defaults when config parsing fails.
  }

  return null;
}

function ensureConfigFile(configPath: string): void {
  if (existsSync(configPath)) {
    return;
  }

  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
  } catch {
    // Ignore file system errors and continue with in-memory defaults.
  }
}

export function loadSessionCleanupConfig(): SessionCleanupConfig {
  const configPath = join(resolveExtensionRoot(), "config.json");
  ensureConfigFile(configPath);

  const raw = readConfigFile(configPath);
  if (!raw) {
    return { ...DEFAULT_CONFIG };
  }

  const enabled = typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled;
  const iconMode = parseIconMode(raw.iconMode) ?? DEFAULT_CONFIG.iconMode;

  return {
    enabled,
    iconMode,
  };
}
