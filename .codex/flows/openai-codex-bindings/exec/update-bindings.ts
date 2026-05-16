import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type FlowContext = {
	flow: {
		config?: Record<string, unknown>;
		event: {
			id: string;
			type: string;
			payload: Record<string, unknown>;
		};
	};
};

type CommandResult = {
	label: string;
	cmd: string[];
	cwd: string;
	exitCode: number | null;
	stdout: string;
	stderr: string;
};

const context = JSON.parse(await Bun.stdin.text()) as FlowContext;
const config = context.flow.config ?? {};
const repoRoot = process.cwd();
const commands: CommandResult[] = [];

try {
	const tag = stringValue(context.flow.event.payload.tag, "payload.tag");
	const version = versionFromTag(tag);
	const packageName = stringConfig("package_name", "@peezy.tech/codex-flows");
	const generatedDir = path.resolve(repoRoot, stringConfig("generated_dir", "packages/codex-client/src/app-server/generated"));
	const packageJsonPath = path.resolve(repoRoot, stringConfig("package_json", "packages/codex-client/package.json"));

	const published = await npmPackageExists(packageName, version);
	if (published && !enabled("force", false)) {
		finish("skipped", `${packageName}@${version} is already published.`, { version, tag });
	}

	await requireCleanWorktree();
	await run("regenerate app-server TypeScript bindings", [
		"npx",
		"-y",
		`@openai/codex@${version}`,
		"app-server",
		"generate-ts",
		"--experimental",
		"--out",
		generatedDir,
	]);

	await updatePackageVersion(packageJsonPath, version);
	await run("refresh Bun lockfile", ["bun", "install"]);
	await run("codex-flows package release check", ["bun", "run", "--filter", packageName, "release:check"]);
	await run("workspace typecheck", ["bun", "run", "check:types"]);
	await run("workspace tests", ["bun", "run", "test"]);
	await run("git diff check", ["git", "diff", "--check"]);

	const status = await run("final git status", ["git", "status", "--short"]);
	if (!status.stdout.trim()) {
		finish("skipped", `No generated binding changes for ${tag}.`, { version, tag });
	}

	if (enabled("commit", true)) {
		await run("stage binding update", ["git", "add", "--", generatedDir, packageJsonPath, path.join(repoRoot, "bun.lock")]);
		await run("commit binding update", [
			"git",
			"commit",
			"-m",
			`flow: update codex-flows for openai codex ${version}`,
		]);
	}

	if (enabled("push", false)) {
		await run("push jojo main", ["git", "push", "origin", "HEAD:main"]);
	}

	if (enabled("publish", false)) {
		await run("push GitHub main", ["git", "push", "github", "HEAD:main"]);
		await run("trigger GitHub trusted publish", [
			"gh",
			"workflow",
			"run",
			stringConfig("github_publish_workflow", "publish-codex-flows.yml"),
			"--repo",
			stringConfig("github_repo", "peezy-tech/codex-flows"),
			"-f",
			`confirm_package=${packageName}`,
		]);
	}

	finish("changed", `${packageName} regenerated for openai/codex ${tag}.`, {
		version,
		tag,
		committed: enabled("commit", true),
		pushed: enabled("push", false),
		published: enabled("publish", false),
	});
} catch (error) {
	finish("failed", error instanceof Error ? error.message : String(error));
}

async function requireCleanWorktree(): Promise<void> {
	const status = await run("dirty worktree check", ["git", "status", "--porcelain=v1"]);
	if (status.stdout.trim()) {
		finish("blocked", "codex-flows checkout has local changes before the release update.", {
			dirtyStatus: status.stdout,
		});
	}
}

async function npmPackageExists(packageName: string, version: string): Promise<boolean> {
	const result = await run("published package check", [
		"npm",
		"view",
		`${packageName}@${version}`,
		"version",
		"--json",
	], { allowFailure: true });
	return result.exitCode === 0 && result.stdout.includes(version);
}

async function updatePackageVersion(packageJsonPath: string, version: string): Promise<void> {
	const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as Record<string, unknown>;
	parsed.version = version;
	await writeFile(packageJsonPath, `${JSON.stringify(parsed, null, "\t")}\n`);
}

async function run(
	label: string,
	cmd: string[],
	options: { allowFailure?: boolean; cwd?: string } = {},
): Promise<CommandResult> {
	const child = Bun.spawn(cmd, {
		cwd: options.cwd ?? repoRoot,
		env: process.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		child.stdout.text(),
		child.stderr.text(),
		child.exited,
	]);
	const result = { label, cmd, cwd: options.cwd ?? repoRoot, exitCode, stdout, stderr };
	commands.push(result);
	if (exitCode !== 0 && !options.allowFailure) {
		throw new Error(`${label} failed with exit ${exitCode}:\n${stderr || stdout}`);
	}
	return result;
}

function finish(status: string, message: string, artifacts: Record<string, unknown> = {}): never {
	const trimmedCommands = commands.map((command) => ({
		...command,
		stdout: truncate(command.stdout),
		stderr: truncate(command.stderr),
	}));
	console.log(`FLOW_RESULT ${JSON.stringify({ status, message, artifacts: { ...artifacts, commands: trimmedCommands } })}`);
	process.exit(0);
}

function enabled(name: string, fallback: boolean): boolean {
	const envName = `CODEX_FLOW_${name.toUpperCase()}`;
	const envValue = process.env[envName];
	if (envValue !== undefined) {
		return ["1", "true", "yes", "on"].includes(envValue.trim().toLowerCase());
	}
	const value = config[name];
	return typeof value === "boolean" ? value : fallback;
}

function stringConfig(name: string, fallback: string): string {
	const value = config[name];
	return typeof value === "string" && value.trim() ? value : fallback;
}

function stringValue(value: unknown, name: string): string {
	if (typeof value !== "string" || !value.trim()) {
		throw new Error(`${name} must be a non-empty string`);
	}
	return value;
}

function versionFromTag(tag: string): string {
	const match = tag.match(/[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?/);
	if (!match) {
		throw new Error(`Could not infer semantic version from release tag ${tag}`);
	}
	return match[0];
}

function truncate(value: string, max = 4000): string {
	return value.length <= max ? value : `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}
