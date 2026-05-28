import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type PatchMoiConfig = {
  git: {
    upstreamRemote: string;
    upstreamBranch: string;
    forkRemote: string;
    targetBranch: string;
    patchPrefix: string;
  };
  fetch: {
    allowFetch: boolean;
    fetchTags: boolean;
    prune: boolean;
    pruneTags: boolean;
  };
  safety: {
    allowRebuild: boolean;
    allowCapture: boolean;
    allowPull: boolean;
  };
};

export const defaultPatchMoiConfig: PatchMoiConfig = {
  git: {
    upstreamRemote: "upstream",
    upstreamBranch: "main",
    forkRemote: "origin",
    targetBranch: "main",
    patchPrefix: "patch/",
  },
  fetch: {
    allowFetch: false,
    fetchTags: true,
    prune: true,
    pruneTags: false,
  },
  safety: {
    allowRebuild: false,
    allowCapture: false,
    allowPull: false,
  },
};

export async function loadPatchMoiConfig(startDir: string): Promise<PatchMoiConfig> {
  const configPath = findPatchMoiConfig(startDir);
  if (!configPath) {
    return cloneDefaultConfig();
  }
  return mergePatchMoiConfig(cloneDefaultConfig(), parsePatchMoiToml(await readFile(configPath, "utf8")));
}

export function findPatchMoiConfig(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, ".patchmoi.toml");
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function canonicalUpstreamRef(config: PatchMoiConfig): string {
  return `refs/remotes/${config.git.upstreamRemote}/${config.git.upstreamBranch}`;
}

export function mergePatchMoiConfig(base: PatchMoiConfig, overrides: unknown): PatchMoiConfig {
  const input = recordValue(overrides);
  const git = recordValue(input.git);
  const fetch = recordValue(input.fetch);
  const safety = recordValue(input.safety);

  return {
    git: {
      upstreamRemote: stringValue(git.upstreamRemote) ?? base.git.upstreamRemote,
      upstreamBranch: stringValue(git.upstreamBranch) ?? base.git.upstreamBranch,
      forkRemote: stringValue(git.forkRemote) ?? base.git.forkRemote,
      targetBranch: stringValue(git.targetBranch) ?? base.git.targetBranch,
      patchPrefix: normalizePatchPrefix(stringValue(git.patchPrefix) ?? base.git.patchPrefix),
    },
    fetch: {
      allowFetch: booleanValue(fetch.allowFetch) ?? base.fetch.allowFetch,
      fetchTags: booleanValue(fetch.fetchTags) ?? base.fetch.fetchTags,
      prune: booleanValue(fetch.prune) ?? base.fetch.prune,
      pruneTags: booleanValue(fetch.pruneTags) ?? base.fetch.pruneTags,
    },
    safety: {
      allowRebuild: booleanValue(safety.allowRebuild) ?? base.safety.allowRebuild,
      allowCapture: booleanValue(safety.allowCapture) ?? base.safety.allowCapture,
      allowPull: booleanValue(safety.allowPull) ?? base.safety.allowPull,
    },
  };
}

function parsePatchMoiToml(source: string): unknown {
  try {
    return Bun.TOML.parse(source) as unknown;
  } catch (error) {
    throw new Error(`failed to parse .patchmoi.toml: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function cloneDefaultConfig(): PatchMoiConfig {
  return {
    git: { ...defaultPatchMoiConfig.git },
    fetch: { ...defaultPatchMoiConfig.fetch },
    safety: { ...defaultPatchMoiConfig.safety },
  };
}

function normalizePatchPrefix(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return defaultPatchMoiConfig.git.patchPrefix;
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
