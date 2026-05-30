import path from "node:path";

type JsonRecord = Record<string, unknown>;

type AutomationContext = {
  automation?: {
    config?: JsonRecord;
  };
  event?: {
    id?: string;
    type?: string;
    payload?: JsonRecord;
  };
  prompt?: string;
  cwd?: string;
  turn?: {
    start?: (params: JsonRecord) => Promise<JsonRecord>;
    wait?: (turn: JsonRecord, options?: JsonRecord) => Promise<JsonRecord>;
  };
};

export default async function startFeatureTurn(context: AutomationContext) {
  const config = record(context.automation?.config);
  const payload = record(context.event?.payload);
  if (!context.turn?.start) {
    return {
      status: "blocked",
      message: "codex-toys turn.start is unavailable; run this automation through codex-toys.",
    };
  }

  const workspaceRoot = context.cwd ?? process.cwd();
  const repo = resolveFrom(workspaceRoot, stringValue(payload.repoPath) ?? stringValue(config.repo) ?? ".");
  const prompt = renderPrompt(context.prompt, {
    mode: "feature-candidate",
    repo,
    feature: {
      title: stringValue(payload.title) ?? stringValue(config.title),
      workBranch: stringValue(payload.branch) ?? stringValue(payload.workBranch) ?? stringValue(config.branch),
      baseRef: stringValue(payload.base) ?? stringValue(config.base),
      patchBranch: stringValue(payload.patchBranch) ?? stringValue(config.patch_branch),
      candidateBranch: stringValue(payload.candidateBranch) ?? stringValue(config.candidate_branch),
    },
    event: {
      id: context.event?.id,
      type: context.event?.type,
      payload,
    },
    policy: {
      patchMoiState: "none",
      executionOwner: "codex-toys",
      durableTruth: "git/forge/codex-toys",
    },
  });
  const turn = await context.turn.start({
    cwd: repo,
    prompt,
    threadId: stringValue(payload.threadId) ?? stringValue(config.thread_id),
    model: stringValue(payload.model) ?? stringValue(config.model),
    serviceTier: stringValue(payload.serviceTier) ?? stringValue(config.service_tier),
    permissions: stringValue(payload.permissions) ?? stringValue(config.permissions),
    skills: stringArray(payload.skills) ?? stringArray(config.skills) ?? ["patch-moi:develop-feature"],
  });

  if (booleanValue(payload.wait) ?? booleanValue(config.wait) ?? false) {
    if (!context.turn.wait) {
      return {
        status: "started",
        message: "Started patch.moi feature turn; wait API is unavailable.",
        turn,
        artifacts: artifacts(repo, context, turn),
      };
    }
    const result = await context.turn.wait(turn, {
      timeoutMs: numberValue(payload.timeoutMs) ?? numberValue(config.timeout_ms),
      pollIntervalMs: numberValue(payload.pollIntervalMs) ?? numberValue(config.poll_interval_ms),
    });
    return {
      status: stringValue(result.status) ?? "completed",
      message: "Completed patch.moi feature turn.",
      turn,
      result,
      artifacts: artifacts(repo, context, result),
    };
  }

  return {
    status: "started",
    message: "Started patch.moi feature turn.",
    turn,
    artifacts: artifacts(repo, context, turn),
  };
}

function renderPrompt(basePrompt: string | undefined, details: JsonRecord): string {
  return [
    basePrompt?.trim(),
    "Runtime context:",
    JSON.stringify(details, null, 2),
  ].filter(Boolean).join("\n\n");
}

function artifacts(repo: string, context: AutomationContext, turn: JsonRecord): JsonRecord {
  return {
    repo,
    eventId: context.event?.id,
    eventType: context.event?.type,
    threadId: stringValue(turn.threadId),
    turnId: stringValue(turn.turnId),
  };
}

function resolveFrom(root: string, value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return strings.length > 0 ? strings : undefined;
}
