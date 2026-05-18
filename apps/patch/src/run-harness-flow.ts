import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverFlows,
  matchingSteps,
  runFlowStep,
  type FlowEvent,
} from "@peezy.tech/codex-flows/flow-runtime";

const workspaceRoot = path.resolve(import.meta.dir, "../../..");
const fixturePath = path.resolve(
  workspaceRoot,
  process.argv[2] ?? "flows/patch-moi-harness-fork/fixtures/upstream-release-v0.1.3.json",
);
const event = JSON.parse(await readFile(fixturePath, "utf8")) as FlowEvent<Record<string, unknown>>;
const flows = await discoverFlows({ cwd: workspaceRoot });
const matches = await matchingSteps(flows, event);
const harnessMatches = matches.filter((entry) => entry.flow.manifest.name.startsWith("patch-moi-harness-"));

if (harnessMatches.length === 0) {
  throw new Error(`No patch-moi-harness-* flow steps matched ${event.type} from ${fixturePath}`);
}

const results = [];
for (const match of harnessMatches) {
  results.push({
    flow: match.flow.manifest.name,
    step: match.step.name,
    result: await runFlowStep({
      flow: match.flow,
      step: match.step,
      event,
    }),
  });
}

console.log(JSON.stringify({
  status: aggregateStatus(results.map((entry) => entry.result.status)),
  event,
  results,
}, null, 2));

if (results.some((entry) => ["blocked", "failed", "needs_intervention"].includes(entry.result.status))) {
  process.exit(1);
}

function aggregateStatus(statuses: string[]): string {
  for (const status of ["failed", "blocked", "needs_intervention", "changed"]) {
    if (statuses.includes(status)) return status;
  }
  return statuses.includes("completed") ? "completed" : "skipped";
}
