const config = flow.config || {};
const payload = flow.event.payload || {};
const commands = [];

function q(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function trim(value) {
  return String(value || "").trim();
}

function truncate(value, max) {
  const textValue = String(value || "");
  if (textValue.length <= max) {
    return textValue;
  }
  return textValue.slice(0, max) + "\n...[truncated " + String(textValue.length - max) + " chars]";
}

function outputOf(result) {
  if (typeof result?.output === "string") {
    return result.output;
  }
  return JSON.stringify(result ?? {});
}

function exitCodeOf(result) {
  if (typeof result?.exit_code === "number") {
    return result.exit_code;
  }
  if (typeof result?.exitCode === "number") {
    return result.exitCode;
  }
  return null;
}

function ok(result) {
  return result.exit_code === 0;
}

function cfg(name, fallback) {
  const value = config[name];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function enabled(name, fallback) {
  const override = flowFlagOverrides[name];
  if (typeof override === "boolean") {
    return override;
  }
  const value = config[name];
  return typeof value === "boolean" ? value : fallback;
}

function versionFromTag(tag) {
  const match = String(tag).match(/[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?/);
  return match ? match[0] : "";
}

async function env(name) {
  if (!name) {
    return "";
  }
  const result = await tools.exec_command({
    cmd: "printf %s \"${" + name + ":-}\"",
    workdir: flow.root,
    yield_time_ms: 1000,
    max_output_tokens: 2000
  });
  return trim(outputOf(result));
}

async function envFlag(name) {
  const value = (await env(name)).trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  return ["1", "true", "yes", "on"].includes(value);
}

async function run(label, cmd, options = {}) {
  const workdir = options.workdir || codexRepo;
  text("\n### " + label + "\n$ " + cmd + "\n");
  const raw = await tools.exec_command({
    cmd,
    workdir,
    yield_time_ms: options.yield_time_ms || 1000,
    max_output_tokens: options.max_output_tokens || 12000
  });
  const result = {
    label,
    cmd,
    workdir,
    exit_code: exitCodeOf(raw),
    output: outputOf(raw)
  };
  commands.push({ ...result, output: truncate(result.output, 4000) });
  text("exit_code=" + String(result.exit_code) + "\n" + truncate(result.output, options.textLimit || 12000) + "\n");
  return result;
}

function finish(status, message, artifacts = {}) {
  result({
    status,
    message,
    artifacts: {
      releaseTag,
      version,
      codexRepo,
      targetBranch,
      commands,
      ...artifacts
    }
  });
}

async function collectRebaseContext(rebaseOutput, beforeSha) {
  const status = await run("rebase conflict status", "git status --short --branch", { max_output_tokens: 12000 });
  const unmerged = await run("unmerged files", "git diff --name-only --diff-filter=U", { max_output_tokens: 12000 });
  const diffStat = await run("conflict diff stat", "git diff --cc --stat", { max_output_tokens: 12000 });
  const conflictDiff = await run("conflict diff", "git diff --cc", { max_output_tokens: 30000, textLimit: 20000 });
  const currentPatch = await run("current rebase patch", "git rebase --show-current-patch", { max_output_tokens: 20000, textLimit: 12000 });
  return {
    beforeSha,
    rebaseOutput,
    statusOutput: status.output,
    unmergedFiles: unmerged.output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    diffStat: diffStat.output,
    conflictDiff: truncate(conflictDiff.output, 20000),
    currentPatch: truncate(currentPatch.output, 12000),
    interventionPrompt: "Continue this same Code Mode thread to resolve the paused rebase. Preserve the fork patch stack, do not abort or reset unless explicitly instructed, then run the configured verification commands."
  };
}

const releaseTag = String(payload.tag || "");
const version = versionFromTag(releaseTag);
const flowFlagOverrides = {
  force: await envFlag("CODEX_FLOW_FORCE"),
  push: await envFlag("CODEX_FLOW_PUSH"),
  publish: await envFlag("CODEX_FLOW_PUBLISH"),
  squash_patch_stack: await envFlag("CODEX_FLOW_SQUASH_PATCH_STACK")
};
const packageName = cfg("package_name", "@peezy.tech/codex");
const targetBranch = (await env(cfg("target_branch_env", ""))) || cfg("target_branch", "main");
const upstreamRemote = cfg("upstream_remote", "upstream");
const upstreamRepoUrl = cfg("upstream_repo_url", "https://github.com/openai/codex.git");
const cargoTargetDir = (await env(cfg("cargo_target_dir_env", ""))) || cfg("cargo_target_dir", "/tmp/peezy-codex-flow-target");
const codexRepo = (await env(cfg("codex_repo_env", ""))) || cfg("codex_repo", "");
const codexRustDir = codexRepo + "/codex-rs";
const codexBinary = cargoTargetDir + "/debug/codex";

if (!releaseTag) {
  finish("failed", "Release payload is missing tag.");
}
if (!version) {
  finish("failed", "Could not infer semantic version from release tag " + releaseTag);
}
if (!codexRepo) {
  finish("blocked", "No Codex fork checkout configured. Set codex_repo or codex_repo_env in flow.toml.");
}

text([
  "Peezy Codex fork update flow",
  "",
  "Release: " + releaseTag,
  "Version: " + version,
  "Target branch: " + targetBranch,
  "Codex repo: " + codexRepo,
  "Upstream remote: " + upstreamRemote + " -> " + upstreamRepoUrl,
  "Cargo target dir: " + cargoTargetDir
].join("\n") + "\n");

const published = await run("published fork package check", "npm view " + q(packageName + "@" + version) + " version --json", {
  max_output_tokens: 4000
});
if (ok(published) && !enabled("force", false)) {
  finish("skipped", packageName + "@" + version + " is already published.");
}

const repoCheck = await run("verify codex repo", "git rev-parse --show-toplevel");
if (!ok(repoCheck)) {
  finish("failed", "codex repo is not a git checkout", { repoCheck: repoCheck.output });
}

const rustWorkspaceCheck = await run("verify codex Rust workspace", "test -f " + q(codexRustDir + "/Cargo.toml"), {
  max_output_tokens: 4000
});
if (!ok(rustWorkspaceCheck)) {
  finish("failed", "codex Rust workspace was not found at the expected codex-rs path.", {
    codexRustDir,
    rustWorkspaceCheck: rustWorkspaceCheck.output
  });
}

const existingRebase = await run(
  "check existing rebase state",
  "test -d \"$(git rev-parse --git-path rebase-merge)\" -o -d \"$(git rev-parse --git-path rebase-apply)\"",
  { max_output_tokens: 4000 }
);
if (existingRebase.exit_code === 0) {
  const context = await collectRebaseContext("A rebase was already in progress before this flow started.", undefined);
  finish("blocked", "A rebase is already in progress in the Codex checkout.", context);
}

await run("codex status before update", "git status --short --branch", { max_output_tokens: 12000 });
const branch = await run("current branch", "git rev-parse --abbrev-ref HEAD", { max_output_tokens: 4000 });
if (!ok(branch)) {
  finish("failed", "could not read current branch", { branchOutput: branch.output });
}

if (trim(branch.output) !== targetBranch) {
  const dirtyBeforeSwitch = await run("dirty check before branch switch", "git status --porcelain=v1", { max_output_tokens: 12000 });
  if (trim(dirtyBeforeSwitch.output)) {
    finish("blocked", "codex checkout has local changes before switching branches.", {
      dirtyStatus: dirtyBeforeSwitch.output
    });
  }
  const switched = await run("switch target branch", "git switch " + q(targetBranch), { max_output_tokens: 12000 });
  if (!ok(switched)) {
    finish("failed", "could not switch to target branch", { switchOutput: switched.output });
  }
}

const dirty = await run("dirty check on target branch", "git status --porcelain=v1", { max_output_tokens: 12000 });
if (trim(dirty.output)) {
  finish("blocked", "codex target branch has local changes. Resolve or stash them before updating.", {
    dirtyStatus: dirty.output
  });
}

const remote = await run(
  "ensure upstream openai/codex remote",
  "git remote get-url " + q(upstreamRemote) + " >/dev/null 2>&1 && git remote set-url " + q(upstreamRemote) + " " + q(upstreamRepoUrl) + " || git remote add " + q(upstreamRemote) + " " + q(upstreamRepoUrl),
  { max_output_tokens: 12000 }
);
if (!ok(remote)) {
  finish("failed", "could not configure upstream remote", { remoteOutput: remote.output });
}

const fetch = await run("fetch upstream tags", "git fetch " + q(upstreamRemote) + " --tags --prune", {
  max_output_tokens: 20000
});
if (!ok(fetch)) {
  finish("failed", "could not fetch upstream release tags", { fetchOutput: fetch.output });
}

const releaseCommit = await run("resolve release tag", "git rev-parse --verify " + q("refs/tags/" + releaseTag + "^{commit}"), {
  max_output_tokens: 4000
});
if (!ok(releaseCommit)) {
  finish("failed", "could not resolve upstream release tag after fetch", {
    releaseTag,
    resolveOutput: releaseCommit.output
  });
}

const beforeHead = await run("codex head before rebase", "git rev-parse HEAD", { max_output_tokens: 4000 });
const rebase = await run("rebase target branch onto upstream release", "git rebase " + q(releaseTag), {
  max_output_tokens: 30000,
  textLimit: 20000
});
if (!ok(rebase)) {
  const context = await collectRebaseContext(rebase.output, trim(beforeHead.output));
  finish("needs_intervention", "Rebase paused with conflicts.", context);
}

if (enabled("squash_patch_stack", true)) {
  const count = await run("count fork patch commits", "git rev-list --count " + q(releaseTag) + "..HEAD", {
    max_output_tokens: 4000
  });
  const commitCount = Number(trim(count.output));
  if (Number.isFinite(commitCount) && commitCount > 1) {
    const reset = await run("squash patch stack reset", "git reset --soft " + q(releaseTag), { max_output_tokens: 12000 });
    if (!ok(reset)) {
      finish("failed", "could not soft reset patch stack for squashing", { resetOutput: reset.output });
    }
    const commit = await run("squash patch stack commit", "git commit -m " + q("peezy: codex fork patches for " + releaseTag), {
      max_output_tokens: 20000
    });
    if (!ok(commit)) {
      finish("failed", "could not commit squashed patch stack", { commitOutput: commit.output });
    }
  }
}

const afterHead = await run("codex head after rebase", "git rev-parse HEAD", { max_output_tokens: 4000 });
await run("codex status after rebase", "git status --short --branch", { max_output_tokens: 12000 });

const build = await run(
  "build fork binary",
  "CARGO_TARGET_DIR=" + q(cargoTargetDir) + " cargo build -p codex-cli --bin codex",
  { workdir: codexRustDir, max_output_tokens: 30000, textLimit: 20000 }
);
if (!ok(build)) {
  finish("failed", "fork binary build failed", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    buildOutput: build.output
  });
}

const versionCheck = await run("verify fork binary", q(codexBinary) + " --version", { max_output_tokens: 4000 });
if (!ok(versionCheck)) {
  finish("failed", "built fork binary did not run", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    versionOutput: versionCheck.output
  });
}

const cargoCheck = await run(
  "cargo check code mode packages",
  "CARGO_TARGET_DIR=" + q(cargoTargetDir) + " cargo check -p codex-app-server -p codex-core -p codex-app-server-protocol",
  { workdir: codexRustDir, max_output_tokens: 30000, textLimit: 20000 }
);
if (!ok(cargoCheck)) {
  finish("failed", "cargo check failed after rebase", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    cargoCheckOutput: cargoCheck.output
  });
}

const protocolTest = await run(
  "protocol code mode execute test",
  "CARGO_TARGET_DIR=" + q(cargoTargetDir) + " cargo test -p codex-app-server-protocol thread_code_mode_execute -- --nocapture",
  { workdir: codexRustDir, max_output_tokens: 30000, textLimit: 20000 }
);
if (!ok(protocolTest)) {
  finish("failed", "protocol Code Mode API test failed after rebase", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    protocolTestOutput: protocolTest.output
  });
}

const fmt = await run("cargo fmt check", "cargo fmt --check", {
  workdir: codexRustDir,
  max_output_tokens: 20000
});
if (!ok(fmt)) {
  finish("failed", "cargo fmt --check failed after rebase", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    fmtOutput: fmt.output
  });
}

const diffCheck = await run("codex diff whitespace check", "git diff --check", { max_output_tokens: 12000 });
if (!ok(diffCheck)) {
  finish("failed", "codex git diff --check failed after rebase", {
    beforeSha: trim(beforeHead.output),
    afterSha: trim(afterHead.output),
    diffCheckOutput: diffCheck.output
  });
}

if (enabled("push", false)) {
  const push = await run("push fork branch", "git push origin HEAD:" + q(targetBranch) + " --force-with-lease", {
    max_output_tokens: 20000
  });
  if (!ok(push)) {
    finish("failed", "could not push rebased fork branch", { pushOutput: push.output });
  }
}

if (enabled("publish", false)) {
  const tagCommand = "git tag -a " + q("rust-v" + version) + " -m " + q("Release " + version);
  const tag = await run("create release tag", tagCommand, { max_output_tokens: 12000 });
  if (!ok(tag)) {
    finish("failed", "could not create release tag", { tagOutput: tag.output });
  }
  const pushTag = await run("push release tag", "git push origin " + q("rust-v" + version), {
    max_output_tokens: 20000
  });
  if (!ok(pushTag)) {
    finish("failed", "could not push release tag", { pushTagOutput: pushTag.output });
  }
}

const finalStatus = await run("final codex status", "git status --short --branch", { max_output_tokens: 12000 });
finish("changed", "Peezy Codex fork rebased onto upstream release and verified.", {
  beforeSha: trim(beforeHead.output),
  afterSha: trim(afterHead.output),
  codexHead: trim(afterHead.output),
  codexBinary,
  codexVersion: trim(versionCheck.output),
  finalStatus: finalStatus.output,
  pushed: enabled("push", false),
  published: enabled("publish", false)
});
