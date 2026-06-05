#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const packageDir = process.env.PACKAGE_DIR;
const confirmPackage = process.env.CONFIRM_PACKAGE;
const githubRef = process.env.GITHUB_REF ?? "";
const dryRun = process.env.DRY_RUN === "true";

const failures = [];

if (!packageDir) failures.push("PACKAGE_DIR is required");
if (!confirmPackage) failures.push("CONFIRM_PACKAGE is required");
if (githubRef !== "refs/heads/main" && !githubRef.startsWith("refs/tags/v")) {
  failures.push(`publishes must run from main or a v* tag, got ${githubRef || "unknown ref"}`);
}

const packageJsonPath = packageDir ? path.join(root, packageDir, "package.json") : "";
let manifest = {};
try {
  manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
} catch (error) {
  failures.push(`failed to read ${packageJsonPath}: ${error instanceof Error ? error.message : String(error)}`);
}

if (manifest.name !== confirmPackage) {
  failures.push(`confirmation package ${confirmPackage} does not match manifest name ${manifest.name ?? "unknown"}`);
}
if (manifest.private) {
  failures.push(`${manifest.name ?? packageDir} is private; remove private=true only when it is intentionally publishable`);
}
const repositoryUrl = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
if (!repositoryUrl?.includes("github.com/peezy-tech/patch.moi")) {
  failures.push("package repository.url must exactly point at the GitHub repository used by npm trusted publishing");
}
if (manifest.name?.startsWith("@") && manifest.publishConfig?.access !== "public") {
  failures.push("scoped public packages must set publishConfig.access to public");
}

if (failures.length > 0) {
  console.error("npm publish validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`${dryRun ? "dry-run" : "publish"} validation passed for ${manifest.name}`);
