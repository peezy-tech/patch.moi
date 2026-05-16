import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  discoverFlows,
  matchingSteps,
  runFlowStep,
  type FlowEvent,
} from "@peezy.tech/flow-runtime";

const workspaceRoot = path.resolve(import.meta.dir, "../../..");
const fixturePath = path.resolve(
  workspaceRoot,
  process.argv[2] ?? "flows/patch-moi-harness/fixtures/upstream-release-v0.1.3.json",
);
const event = JSON.parse(await readFile(fixturePath, "utf8")) as FlowEvent<Record<string, unknown>>;
const flows = await discoverFlows({ cwd: workspaceRoot, roots: [path.join(workspaceRoot, "flows")] });
const matches = await matchingSteps(flows, event);
const match = matches.find((entry) => entry.flow.manifest.name === "patch-moi-harness");

if (!match) {
  throw new Error(`No patch-moi-harness flow step matched ${event.type} from ${fixturePath}`);
}

const result = await runFlowStep({
  flow: match.flow,
  step: match.step,
  event,
});

console.log(JSON.stringify(result, null, 2));

if (["blocked", "failed", "needs_intervention"].includes(result.status)) {
  process.exit(1);
}
