import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { IconModePreference } from "../config-store.js";

export type PickerIconMode = "nerd" | "fallback";

export interface PickerIcons {
  cursor: string;
  checkboxChecked: string;
  checkboxUnchecked: string;
  scrollUp: string;
  scrollDown: string;
  actionMove: string;
  actionPage: string;
  actionToggle: string;
  actionSelectAll: string;
  actionRefresh: string;
  actionDelete: string;
  actionCancel: string;
}

export interface ResolvedPickerIcons {
  mode: PickerIconMode;
  icons: PickerIcons;
}

export interface PickerIconDetectionContext {
  platform: string;
  env: Record<string, string | undefined>;
  pathExists: (path: string) => boolean;
  readTextFile: (path: string) => string | null;
}

const NERD_ICONS: PickerIcons = {
  cursor: "",
  checkboxChecked: "",
  checkboxUnchecked: "",
  scrollUp: "",
  scrollDown: "",
  actionMove: "󰆾",
  actionPage: "󰘖",
  actionToggle: "󰄱",
  actionSelectAll: "󰄬",
  actionRefresh: "󰑐",
  actionDelete: "󰆴",
  actionCancel: "󰜺",
};

const FALLBACK_ICONS: PickerIcons = {
  cursor: "›",
  checkboxChecked: "☑",
  checkboxUnchecked: "☐",
  scrollUp: "↑",
  scrollDown: "↓",
  actionMove: "↕",
  actionPage: "⇵",
  actionToggle: "☑",
  actionSelectAll: "☑",
  actionRefresh: "↻",
  actionDelete: "✖",
  actionCancel: "✖",
};

const WINDOWS_TERMINAL_SETTINGS_CANDIDATES = [
  ["Packages", "Microsoft.WindowsTerminal_8wekyb3d8bbwe", "LocalState", "settings.json"],
  ["Packages", "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", "LocalState", "settings.json"],
  ["Packages", "Microsoft.WindowsTerminalDev_8wekyb3d8bbwe", "LocalState", "settings.json"],
  ["Microsoft", "Windows Terminal", "settings.json"],
] as const;

const KNOWN_NERD_TERM_PROGRAM_HINTS = [
  "wezterm",
  "ghostty",
  "kitty",
  "iterm",
  "warpterminal",
  "warp",
  "hyper",
  "alacritty",
  "konsole",
] as const;

const KNOWN_NERD_TERM_HINTS = ["xterm-kitty", "wezterm", "ghostty", "alacritty", "konsole"] as const;

const FONT_HINT_ENV_KEYS = [
  "PI_SESSION_CLEANUP_FONT_FAMILY",
  "PI_FONT_FAMILY",
  "TERM_PROGRAM_FONT",
  "KITTY_FONT_FAMILY",
  "WEZTERM_FONT",
  "WT_PROFILE_FONT_FACE",
] as const;

function createDefaultContext(): PickerIconDetectionContext {
  return {
    platform: process.platform,
    env: process.env,
    pathExists: (path) => existsSync(path),
    readTextFile: (path) => {
      try {
        return readFileSync(path, "utf8");
      } catch {
        return null;
      }
    },
  };
}

function parseEnvBoolean(value: string | undefined): boolean | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function parseMode(value: string | undefined): IconModePreference | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "nerd" || normalized === "fallback") {
    return normalized;
  }

  return null;
}

function resolvePreference(
  configPreference: IconModePreference,
  env: Record<string, string | undefined>,
): IconModePreference {
  const envMode = parseMode(env.PI_SESSION_CLEANUP_ICON_MODE);
  if (envMode) {
    return envMode;
  }

  const envBool = parseEnvBoolean(env.PI_SESSION_CLEANUP_NERD_FONT ?? env.PI_NERD_FONT);
  if (envBool !== null) {
    return envBool ? "nerd" : "fallback";
  }

  return configPreference;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeProfileId(value: string): string {
  return value.trim().replace(/^\{/, "").replace(/\}$/, "").toLowerCase();
}

function readWindowsTerminalSettingsJson(
  settingsPath: string,
  context: PickerIconDetectionContext,
): Record<string, unknown> | null {
  const raw = context.readTextFile(settingsPath);
  return raw ? parseSettingsJson(raw) : null;
}

function parseSettingsJson(raw: string): Record<string, unknown> | null {
  const withoutBom = raw.replace(/^\uFEFF/, "");

  try {
    const parsed = JSON.parse(withoutBom);
    return isRecord(parsed) ? parsed : null;
  } catch {
    const withoutComments = stripJsonComments(withoutBom);
    const withoutTrailingCommas = stripTrailingCommas(withoutComments);

    try {
      const parsed = JSON.parse(withoutTrailingCommas);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}

function stripJsonComments(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (inLineComment) {
      if (current === "\n") {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

function stripTrailingCommas(value: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];

    if (inString) {
      result += current;
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      result += current;
      continue;
    }

    if (current !== ",") {
      result += current;
      continue;
    }

    let lookahead = index + 1;
    while (lookahead < value.length && /\s/.test(value[lookahead] ?? "")) {
      lookahead += 1;
    }

    const nextNonSpace = value[lookahead];
    if (nextNonSpace === "}" || nextNonSpace === "]") {
      continue;
    }

    result += current;
  }

  return result;
}

function getRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  return isRecord(nested) ? nested : null;
}

function getProfileFontFace(profile: Record<string, unknown> | null): string | null {
  if (!profile) {
    return null;
  }

  const font = getRecord(profile, "font");
  if (font && typeof font.face === "string" && font.face.trim().length > 0) {
    return font.face;
  }

  if (typeof profile.fontFace === "string" && profile.fontFace.trim().length > 0) {
    return profile.fontFace;
  }

  return null;
}

function findProfileById(
  settings: Record<string, unknown>,
  wtProfileId: string | undefined,
): Record<string, unknown> | null {
  if (!wtProfileId) {
    return null;
  }

  const profiles = getRecord(settings, "profiles");
  const list = profiles?.list;
  if (!Array.isArray(list)) {
    return null;
  }

  const expectedId = normalizeProfileId(wtProfileId);
  if (expectedId.length === 0) {
    return null;
  }

  for (const item of list) {
    if (!isRecord(item)) {
      continue;
    }

    const guid = typeof item.guid === "string" ? normalizeProfileId(item.guid) : "";
    if (guid === expectedId) {
      return item;
    }
  }

  return null;
}

function resolveWindowsTerminalSettingsPath(context: PickerIconDetectionContext): string | null {
  const localAppData = context.env.LOCALAPPDATA;
  if (!localAppData) {
    return null;
  }

  for (const segments of WINDOWS_TERMINAL_SETTINGS_CANDIDATES) {
    const candidatePath = join(localAppData, ...segments);
    if (context.pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function isNerdFontFace(fontFace: string | null): boolean {
  return typeof fontFace === "string" && /nerd/i.test(fontFace);
}

function detectFontHintFromEnv(env: Record<string, string | undefined>): boolean {
  for (const key of FONT_HINT_ENV_KEYS) {
    if (isNerdFontFace(env[key] ?? null)) {
      return true;
    }
  }

  return false;
}

function detectKnownTerminalHint(env: Record<string, string | undefined>): boolean {
  if (env.GHOSTTY_RESOURCES_DIR || env.WEZTERM_EXECUTABLE || env.WEZTERM_PANE || env.KITTY_WINDOW_ID) {
    return true;
  }

  const termProgram = (env.TERM_PROGRAM ?? "").trim().toLowerCase();
  if (KNOWN_NERD_TERM_PROGRAM_HINTS.some((hint) => termProgram.includes(hint))) {
    return true;
  }

  const term = (env.TERM ?? "").trim().toLowerCase();
  return KNOWN_NERD_TERM_HINTS.some((hint) => term.includes(hint));
}

function detectWindowsTerminalNerdFont(context: PickerIconDetectionContext): boolean {
  if (!context.env.WT_SESSION) {
    return false;
  }

  const settingsPath = resolveWindowsTerminalSettingsPath(context);
  if (!settingsPath) {
    return false;
  }

  const settings = readWindowsTerminalSettingsJson(settingsPath, context);
  if (!settings) {
    return false;
  }

  const activeProfile = findProfileById(settings, context.env.WT_PROFILE_ID);
  const activeProfileFont = getProfileFontFace(activeProfile);
  if (activeProfileFont !== null) {
    return isNerdFontFace(activeProfileFont);
  }

  const profiles = getRecord(settings, "profiles");
  const profileDefaultsFont = getProfileFontFace(getRecord(profiles, "defaults"));
  if (profileDefaultsFont !== null) {
    return isNerdFontFace(profileDefaultsFont);
  }

  const rootDefaultsFont = getProfileFontFace(getRecord(settings, "defaults"));
  if (rootDefaultsFont !== null) {
    return isNerdFontFace(rootDefaultsFont);
  }

  return false;
}

function resolveAutoMode(context: PickerIconDetectionContext): PickerIconMode {
  if (context.platform === "win32" && detectWindowsTerminalNerdFont(context)) {
    return "nerd";
  }

  if (detectFontHintFromEnv(context.env) || detectKnownTerminalHint(context.env)) {
    return "nerd";
  }

  return "fallback";
}

function iconsForMode(mode: PickerIconMode): PickerIcons {
  return mode === "nerd" ? NERD_ICONS : FALLBACK_ICONS;
}

export function resolvePickerIconsForContext(
  configPreference: IconModePreference,
  context: PickerIconDetectionContext,
): ResolvedPickerIcons {
  const preference = resolvePreference(configPreference, context.env);
  const mode =
    preference === "auto"
      ? resolveAutoMode(context)
      : preference === "nerd"
        ? "nerd"
        : "fallback";

  return {
    mode,
    icons: iconsForMode(mode),
  };
}

export function resolvePickerIcons(configPreference: IconModePreference): ResolvedPickerIcons {
  return resolvePickerIconsForContext(configPreference, createDefaultContext());
}
