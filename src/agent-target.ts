import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { parseEnumString, toRecord } from "./record-utils.js";

const DEFAULT_PROJECT_SOURCE_DIRS = [".omp/agents", ".pi/agents", ".claude/agents"];
const DEFAULT_USER_SOURCE_DIRS = ["{home}/.omp/agents", "{agentDir}/agents", "{home}/.claude/agents"];
const ROUTER_CONFIG_FILE_NAME = "config.json";
const ROUTER_EXTENSION_NAME = "pi-agent-router";
const PI_AGENT_DIR_ENV_VAR = "PI_CODING_AGENT_DIR";

const SESSION_EXTENSION_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

type AgentMode = "primary" | "subagent" | "all";

interface AgentDiscoveryConfig {
  projectSourceDirs: string[];
  userSourceDirs: string[];
}

export interface SelectableAgent {
  name: string;
  description: string;
  mode?: AgentMode;
}

interface AgentSelectionMenu {
  labels: string[];
  valueByLabel: Map<string, string>;
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : null;
}

function expandHomeDirectory(configuredDir: string, homeDirectory: string): string {
  if (configuredDir === "~") {
    return homeDirectory;
  }

  if (configuredDir.startsWith("~/") || configuredDir.startsWith("~\\")) {
    return join(homeDirectory, stripLeadingPathSeparators(configuredDir.slice(1)));
  }

  return configuredDir;
}

function resolvePiAgentDir(): string {
  const configuredDir = process.env[PI_AGENT_DIR_ENV_VAR]?.trim();
  if (configuredDir) {
    return expandHomeDirectory(configuredDir, homedir());
  }

  return join(homedir(), ".pi", "agent");
}

function resolveRouterConfigCandidates(): string[] {
  const agentDir = resolvePiAgentDir();
  const extensionParentDir = dirname(SESSION_EXTENSION_ROOT);

  return [
    join(extensionParentDir, ROUTER_EXTENSION_NAME, ROUTER_CONFIG_FILE_NAME),
    join(agentDir, "extensions", ROUTER_EXTENSION_NAME, ROUTER_CONFIG_FILE_NAME),
  ];
}

function parseRouterConfigFile(configPath: string): AgentDiscoveryConfig | null {
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
    const config = toRecord(parsed);
    const agentDiscovery = toRecord(config?.agentDiscovery);
    const projectSourceDirs = normalizeStringArray(agentDiscovery?.projectSourceDirs);
    const userSourceDirs = normalizeStringArray(agentDiscovery?.userSourceDirs);

    return {
      projectSourceDirs: projectSourceDirs ?? [...DEFAULT_PROJECT_SOURCE_DIRS],
      userSourceDirs: userSourceDirs ?? [...DEFAULT_USER_SOURCE_DIRS],
    };
  } catch {
    // Unreadable or malformed config; try the next candidate.
    return null;
  }
}

function loadAgentDiscoveryConfig(): AgentDiscoveryConfig {
  for (const configPath of resolveRouterConfigCandidates()) {
    const config = parseRouterConfigFile(configPath);
    if (config) {
      return config;
    }
  }

  return {
    projectSourceDirs: [...DEFAULT_PROJECT_SOURCE_DIRS],
    userSourceDirs: [...DEFAULT_USER_SOURCE_DIRS],
  };
}

function stripLeadingPathSeparators(value: string): string {
  return value.replace(/^[\\/]+/, "");
}

function resolveConfiguredUserPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return resolve(resolvePiAgentDir(), "agents");
  }

  if (trimmed === "~") {
    return homedir();
  }

  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return join(homedir(), stripLeadingPathSeparators(trimmed.slice(1)));
  }

  if (trimmed === "{home}") {
    return homedir();
  }

  if (trimmed.startsWith("{home}/") || trimmed.startsWith("{home}\\")) {
    return join(homedir(), stripLeadingPathSeparators(trimmed.slice("{home}".length)));
  }

  if (trimmed === "{agentDir}") {
    return resolvePiAgentDir();
  }

  if (trimmed.startsWith("{agentDir}/") || trimmed.startsWith("{agentDir}\\")) {
    return join(resolvePiAgentDir(), stripLeadingPathSeparators(trimmed.slice("{agentDir}".length)));
  }

  return resolve(trimmed);
}

function isDirectory(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function findNearestProjectAgentDirs(cwd: string, projectSourceDirs: readonly string[]): string[] {
  let currentDir = resolve(cwd);

  while (true) {
    const candidates = projectSourceDirs
      .map((sourceDir) => resolve(currentDir, sourceDir))
      .filter((candidate) => isDirectory(candidate));

    if (candidates.length > 0) {
      return candidates;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return [];
    }

    currentDir = parentDir;
  }
}

const AGENT_MODE_VALUES = ["primary", "subagent", "all"] as const;

function parseAgentMode(value: unknown): AgentMode | undefined {
  return parseEnumString<AgentMode, undefined>(value, AGENT_MODE_VALUES, undefined);
}

function parseFrontmatter(content: string): Record<string, string> | null {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }

  const end = normalized.indexOf("\n---", 4);
  if (end === -1) {
    return null;
  }

  const frontmatter: Record<string, string> = {};
  const lines = normalized.slice(4, end).split("\n");

  for (const line of lines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
    if (key) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

function parseAgentFile(filePath: string): SelectableAgent | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    if (!frontmatter?.name) {
      return null;
    }

    return {
      name: frontmatter.name,
      description: frontmatter.description || `Agent ${frontmatter.name}`,
      mode: parseAgentMode(frontmatter.mode),
    };
  } catch {
    return null;
  }
}

function loadAgentsFromDir(dirPath: string): SelectableAgent[] {
  try {
    return readdirSync(dirPath)
      .filter((entry) => entry.endsWith(".md"))
      .map((entry) => parseAgentFile(join(dirPath, entry)))
      .filter((agent): agent is SelectableAgent => Boolean(agent));
  } catch {
    return [];
  }
}

function truncateDescription(description: string, maxLength = 72): string {
  const normalized = description.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatModeBadge(agent: SelectableAgent): string {
  return `[${agent.mode ?? "primary"}]`;
}

function formatCurrentMarker(currentAgentName: string | null, candidateAgentName: string): string {
  return currentAgentName === candidateAgentName ? "●" : "○";
}

function buildAgentSelectionLabel(
  agent: SelectableAgent,
  currentAgentName: string | null,
): string {
  return [
    formatCurrentMarker(currentAgentName, agent.name),
    agent.name,
    formatModeBadge(agent),
    "—",
    truncateDescription(agent.description),
  ].join(" ");
}

export function buildAgentSelectionMenu(
  agents: readonly SelectableAgent[],
  currentAgentName: string | null,
): AgentSelectionMenu {
  const labels: string[] = [];
  const valueByLabel = new Map<string, string>();

  for (const agent of agents) {
    const label = buildAgentSelectionLabel(agent, currentAgentName);
    labels.push(label);
    valueByLabel.set(label, agent.name);
  }

  return {
    labels,
    valueByLabel,
  };
}

export function discoverSelectableAgents(cwd: string): SelectableAgent[] {
  const config = loadAgentDiscoveryConfig();
  const projectAgentDirs = findNearestProjectAgentDirs(cwd, config.projectSourceDirs);
  const userAgentDirs = config.userSourceDirs
    .map((sourceDir) => resolveConfiguredUserPath(sourceDir))
    .filter((candidate) => isDirectory(candidate));

  const byName = new Map<string, SelectableAgent>();
  const precedenceOrder = [
    ...userAgentDirs.slice().reverse(),
    ...projectAgentDirs.slice().reverse(),
  ];

  for (const sourceDir of precedenceOrder) {
    const agents = loadAgentsFromDir(sourceDir);
    for (const agent of agents) {
      byName.set(agent.name, agent);
    }
  }

  return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function resolveTargetAgentForSessionNix(
  ctx: ExtensionCommandContext,
  input: string | undefined,
  currentAgentName: string | null,
): Promise<SelectableAgent | null | undefined> {
  const agents = discoverSelectableAgents(ctx.cwd);
  if (agents.length === 0) {
    ctx.ui.notify(
      "No agents were discovered. Check pi-agent-router agent directories before using /nix agent.",
      "warning",
    );
    return undefined;
  }

  if (input) {
    const matchedAgent = agents.find((agent) => agent.name === input);
    if (!matchedAgent) {
      const agentNames = agents.map((agent) => agent.name).join(", ");
      ctx.ui.notify(`Unknown agent: ${input}\nAvailable agents: ${agentNames}`, "warning");
      return undefined;
    }

    return matchedAgent;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify("/nix agent requires an explicit agent name in non-interactive mode.", "warning");
    return undefined;
  }

  const { showAgentTargetPicker } = await import("./tui/agent-target-picker.js");
  const selectedAgentName = await showAgentTargetPicker(ctx, agents, currentAgentName);

  if (!selectedAgentName) {
    return null;
  }

  const selectedAgent = agents.find((agent) => agent.name === selectedAgentName);
  if (!selectedAgent) {
    ctx.ui.notify("Unknown agent selection. Please try again.", "warning");
    return undefined;
  }

  return selectedAgent;
}
