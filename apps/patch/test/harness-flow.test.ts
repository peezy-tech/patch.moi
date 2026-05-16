import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import {
  discoverFlows,
  matchingSteps,
  runFlowStep,
  type FlowEvent,
} from "@peezy.tech/flow-runtime";

const workspaceRoot = path.resolve(import.meta.dir, "../../..");
const harnessFork = path.join(workspaceRoot, "harness/fork");

describe("patch.moi harness flow", () => {
  test("matches the release fixture and verifies the current fork", async () => {
    const event = JSON.parse(await readFile(
      path.join(workspaceRoot, "flows/patch-moi-harness/fixtures/upstream-release-v0.1.3.json"),
      "utf8",
    )) as FlowEvent<Record<string, unknown>>;
    const flows = await discoverFlows({ cwd: workspaceRoot });
    const matches = await matchingSteps(flows, event);
    const match = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness");

    expect(match).toBeDefined();
    if (!match) {
      return;
    }

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
    const afterHead = await git(["rev-parse", "HEAD"]);

    expect(result.status).toBe("completed");
    expect(result.message).toContain("package checks passed");
    expect(afterHead).toBe(beforeHead);
    expect(await git(["status", "--porcelain=v1"])).toBe("");
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
