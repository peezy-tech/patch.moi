#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hasInstalledDependencies =
  existsSync(resolve(pluginRoot, "node_modules", ".bun")) ||
  existsSync(resolve(pluginRoot, "node_modules", "@peezy.tech", "codex-flows"));

if (!hasInstalledDependencies) {
  const install = Bun.spawnSync(["bun", "install", "--frozen-lockfile"], {
    cwd: pluginRoot,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  });

  if (install.exitCode !== 0) {
    process.exit(install.exitCode ?? 1);
  }
}

const server = Bun.spawn(["bun", "run", "--filter", "@peezy.tech/patch", "mcp"], {
  cwd: pluginRoot,
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.kill(signal);
  });
}

process.exit(await server.exited);
