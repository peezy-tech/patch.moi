import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  discoverFlows,
  matchingSteps,
  runFlowStep,
  type FlowEvent,
} from "@peezy.tech/codex-flows/flow-runtime";

const workspaceRoot = path.resolve(import.meta.dir, "../../..");
const harnessFork = path.join(workspaceRoot, "harness/fork");

describe("patch.moi harness flow", () => {
  test("matches the release fixture like the Codex fork release fanout", async () => {
    const event = JSON.parse(await readFile(
      path.join(workspaceRoot, "flows/patch-moi-harness-fork/fixtures/upstream-release-v0.1.3.json"),
      "utf8",
    )) as FlowEvent<Record<string, unknown>>;
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, event);
    const harnessMatches = matches
      .filter((entry) => entry.flow.manifest.name.startsWith("patch-moi-harness-"))
      .map(({ flow, step }) => `${flow.manifest.name}/${step.name}`);

    expect(harnessMatches).toEqual([
      "patch-moi-harness-bindings/generate-bindings",
      "patch-moi-harness-fork/release-cycle",
    ]);
  });

  test("release fixture regenerates bindings and rebuilds the patch-branch fork", async () => {
    const event = JSON.parse(await readFile(
      path.join(workspaceRoot, "flows/patch-moi-harness-fork/fixtures/upstream-release-v0.1.3.json"),
      "utf8",
    )) as FlowEvent<Record<string, unknown>>;
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, event);
    const bindingMatch = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness-bindings");
    const forkMatch = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness-fork");

    expect(bindingMatch).toBeDefined();
    expect(forkMatch).toBeDefined();
    if (!bindingMatch || !forkMatch) return;

    const beforeHead = await git(["rev-parse", "HEAD"]);
    const bindings = await runFlowStep({
      flow: bindingMatch.flow,
      step: bindingMatch.step,
      event,
      env: {
        CODEX_FLOW_FETCH: "0",
        CODEX_FLOW_PUSH: "0",
      },
    });
    const fork = await runFlowStep({
      flow: forkMatch.flow,
      step: forkMatch.step,
      event,
      env: {
        CODEX_FLOW_FETCH: "0",
        CODEX_FLOW_PUSH: "0",
      },
    });
    const afterHead = await git(["rev-parse", "HEAD"]);

    expect(["changed", "completed"]).toContain(bindings.status);
    expect(typeof bindings.artifacts?.artifactPath).toBe("string");
    await access(String(bindings.artifacts?.artifactPath));

    expect(fork.status).toBe("completed");
    expect(fork.message).toContain("Harness fork already matches");
    expect(fork.artifacts?.applied).toMatchObject([
      { name: "patch/010-maintained-greeting" },
      { name: "patch/020-shout-mode" },
      { name: "patch/030-package-identity" },
    ]);
    expect(fork.artifacts?.candidateRefs).toMatchObject([
      {
        kind: "branch",
        repo: "matamune-peezy/patch-moi-harness",
        remote: "local",
        ref: "refs/heads/main",
        sha: afterHead,
        pushed: false,
      },
    ]);
    expect(afterHead).toBe(beforeHead);
    expect(await git(["status", "--porcelain=v1"])).toBe("");
  });

  test("matches and runs the harness main branch update path", async () => {
    const event = JSON.parse(await readFile(
      path.join(workspaceRoot, "flows/patch-moi-harness-fork/fixtures/upstream-main-v0.1.3.json"),
      "utf8",
    )) as FlowEvent<Record<string, unknown>>;
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, event);
    expect(matches.map(({ flow, step }) => `${flow.manifest.name}/${step.name}`)).toContain(
      "patch-moi-harness-fork/main-branch-update",
    );
    const match = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness-fork");
    if (!match) return;

    const beforeHead = await git(["rev-parse", "HEAD"]);
    const result = await runFlowStep({
      flow: match.flow,
      step: match.step,
      event,
      env: {
        CODEX_FLOW_FETCH: "0",
        CODEX_FLOW_PUSH: "0",
      },
    });

    expect(result.status).toBe("completed");
    expect(result.artifacts?.upstreamBranch).toBe("upstream");
    expect(await git(["rev-parse", "HEAD"])).toBe(beforeHead);
    expect(await git(["status", "--porcelain=v1"])).toBe("");
  });

  test("matches and runs the downstream harness fork package artifact path", async () => {
    const event = JSON.parse(await readFile(
      path.join(workspaceRoot, "flows/patch-moi-harness-flows-fork/fixtures/downstream-fork-release-v0.1.3-fork.0.json"),
      "utf8",
    )) as FlowEvent<Record<string, unknown>>;
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, event);
    expect(matches.map(({ flow, step }) => `${flow.manifest.name}/${step.name}`)).toContain(
      "patch-moi-harness-flows-fork/release-fork",
    );
    const match = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness-flows-fork");
    if (!match) return;

    const result = await runFlowStep({
      flow: match.flow,
      step: match.step,
      event,
      env: {
        CODEX_FLOW_FETCH: "0",
        CODEX_FLOW_PUSH: "0",
        CODEX_FLOW_PUBLISH: "0",
      },
    });
    const tarballs = await readdir(path.join(workspaceRoot, ".codex/flow-artifacts/patch-moi-harness-flows-fork-release"));

    expect(result.status).toBe("changed");
    expect(result.artifacts?.candidateRefs).toMatchObject([
      {
        kind: "artifact",
        repo: "matamune-peezy/patch-moi-harness",
        pushed: false,
      },
    ]);
    expect(tarballs.some((entry) => entry.endsWith(".tgz"))).toBe(true);
  });

  test("matches installed Codex release flows without executing release work", async () => {
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, {
      id: "patch:upstream.release:openai/codex:rust-v0.130.0",
      type: "upstream.release",
      source: "patch",
      receivedAt: "2026-05-16T00:00:00.000Z",
      payload: { repo: "openai/codex", tag: "rust-v0.130.0" },
    });

    expect(matches.map(({ flow, step }) => `${flow.manifest.name}/${step.name}`)).toEqual([
      "openai-codex-bindings/regenerate-bindings",
      "peezy-codex-fork/release-cycle",
    ]);

    const forkMatch = matches.find((entry) => entry.flow.manifest.name === "peezy-codex-fork");
    expect(forkMatch?.step.runner).toBe("bun");
    expect(forkMatch?.step.script).toBe("exec/update-fork.ts");
  });
});

async function git(args: string[]): Promise<string> {
  const child = Bun.spawn(["git", "-C", harnessFork, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit ${exitCode}:\n${stderr || stdout}`);
  }
  return stdout.trim();
}
