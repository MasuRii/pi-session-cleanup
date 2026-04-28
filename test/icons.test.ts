import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import {
  resolvePickerIconsForContext,
  type PickerIconDetectionContext,
} from "../src/ui/icons.js";

function createContext(options?: {
  platform?: string;
  env?: Record<string, string | undefined>;
  files?: Record<string, string>;
}): PickerIconDetectionContext {
  const files = new Map(Object.entries(options?.files ?? {}));

  return {
    platform: options?.platform ?? "linux",
    env: options?.env ?? {},
    pathExists: (path) => files.has(path),
    readTextFile: (path) => files.get(path) ?? null,
  };
}

test("auto icon mode prefers nerd icons for known terminal hints", () => {
  const resolved = resolvePickerIconsForContext(
    "auto",
    createContext({
      env: {
        TERM_PROGRAM: "WezTerm",
      },
    }),
  );

  assert.equal(resolved.mode, "nerd");
  assert.equal(resolved.icons.cursor, "");
});

test("auto icon mode falls back when no font hints are present", () => {
  const resolved = resolvePickerIconsForContext("auto", createContext());

  assert.equal(resolved.mode, "fallback");
  assert.equal(resolved.icons.cursor, "›");
});

test("auto icon mode reads windows terminal font settings before falling back", () => {
  const localAppData = join("C:", "Users", "tester", "AppData", "Local");
  const settingsPath = join(
    localAppData,
    "Packages",
    "Microsoft.WindowsTerminal_8wekyb3d8bbwe",
    "LocalState",
    "settings.json",
  );
  const resolved = resolvePickerIconsForContext(
    "auto",
    createContext({
      platform: "win32",
      env: {
        LOCALAPPDATA: localAppData,
        WT_SESSION: "1",
        WT_PROFILE_ID: "{ABC-123}",
      },
      files: {
        [settingsPath]: `{
          // Active profile uses a patched font.
          "profiles": {
            "list": [
              {
                "guid": "{ABC-123}",
                "fontFace": "JetBrainsMono Nerd Font",
              },
            ],
          },
        }`,
      },
    }),
  );

  assert.equal(resolved.mode, "nerd");
  assert.equal(resolved.icons.actionDelete, "󰆴");
});
