#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type PackageJson = {
  name?: string;
  private?: boolean;
  repository?: string | { type?: string; url?: string; directory?: string };
  publishConfig?: { access?: string; provenance?: boolean };
};

const root = path.resolve(import.meta.dir, "..");
const requiredFiles = [
  "RELEASE.md",
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/publish-npm.yml",
  "docs/pages/operations/release.md",
];
const failures: string[] = [];

for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) {
    failures.push(`missing ${file}`);
  }
}

const publishWorkflowPath = path.join(root, ".github/workflows/publish-npm.yml");
if (existsSync(publishWorkflowPath)) {
  const workflow = readFileSync(publishWorkflowPath, "utf8");
  requireIncludes(workflow, "id-token: write", "publish-npm.yml must request OIDC id-token write permission");
  requireIncludes(workflow, "environment: npm-publish", "publish-npm.yml must use the npm-publish environment");
  requireIncludes(workflow, "node-version: \"24\"", "publish-npm.yml must use Node 24 for npm trusted publishing");
  requireIncludes(workflow, "npm publish", "publish-npm.yml must call npm publish");
  for (const forbidden of ["NPM_TOKEN", "NODE_AUTH_TOKEN", "secrets.NPM"]) {
    if (workflow.includes(forbidden)) {
      failures.push(`publish-npm.yml must not reference ${forbidden}; use npm trusted publishing OIDC`);
    }
  }
}

const docsConfig = readFileSync(path.join(root, "docs/tome.config.js"), "utf8");
requireIncludes(docsConfig, "operations/release", "docs navigation must include operations/release");

for (const packagePath of ["apps/patch/package.json"]) {
  const manifest = readJson<PackageJson>(packagePath);
  if (manifest.private === false) {
    if (!manifest.name) {
      failures.push(`${packagePath} is publishable but has no package name`);
    }
    if (!repositoryUrl(manifest.repository)?.includes("github.com/peezy-tech/patch.moi")) {
      failures.push(`${packagePath} is publishable but repository.url does not point at github.com/peezy-tech/patch.moi`);
    }
    if (manifest.name?.startsWith("@") && manifest.publishConfig?.access !== "public") {
      failures.push(`${packagePath} is scoped and publishable; set publishConfig.access=\"public\"`);
    }
  }
}

if (failures.length > 0) {
  console.error("release check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("release check passed");

function requireIncludes(source: string, expected: string, message: string): void {
  if (!source.includes(expected)) {
    failures.push(message);
  }
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function repositoryUrl(repository: PackageJson["repository"]): string | undefined {
  if (typeof repository === "string") {
    return repository;
  }
  return repository?.url;
}
