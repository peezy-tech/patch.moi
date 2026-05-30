import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const repoRoot = join(import.meta.dir, "../../..");

describe("patch.moi Codex plugin package", () => {
  test("declares plugin metadata, skills, and MCP server", async () => {
    const manifest = JSON.parse(await readFile(join(repoRoot, ".codex-plugin/plugin.json"), "utf8"));
    const mcp = JSON.parse(await readFile(join(repoRoot, ".mcp.json"), "utf8"));
    const marketplace = JSON.parse(await readFile(join(repoRoot, ".agents/plugins/marketplace.json"), "utf8"));

    expect(manifest).toMatchObject({
      name: "patch-moi",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
      interface: {
        displayName: "patch.moi",
        category: "Coding",
      },
    });
    expect(manifest.interface.capabilities).toContain("Read");
    expect(mcp.mcpServers["patch-moi"]).toMatchObject({
      command: "bun",
      args: ["run", "scripts/patch-moi-mcp-bootstrap.ts"],
      cwd: ".",
    });
    expect(marketplace).toMatchObject({
      name: "patch-moi",
      interface: {
        displayName: "patch.moi",
      },
    });
    expect(marketplace.plugins).toContainEqual({
      name: "patch-moi",
      source: { source: "url", url: "./" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
      category: "Coding",
    });
  });

  test("ships patch-moi prefixed operator skills", async () => {
    const skillNames = [
      "develop-feature",
      "maintain-fork",
      "inspect-upstream-release",
      "install-codex-toys-templates",
      "maintain-fork-with-codex-toys",
      "pickup-runner-candidate",
    ];
    const skills = await Promise.all(skillNames.map((name) =>
      readFile(join(repoRoot, "skills", name, "SKILL.md"), "utf8")
    ));

    expect(skills[0]).toContain('name: "patch-moi:develop-feature"');
    expect(skills[1]).toContain('name: "patch-moi:maintain-fork"');
    expect(skills[2]).toContain('name: "patch-moi:inspect-upstream-release"');
    expect(skills[3]).toContain('name: "patch-moi:install-codex-toys-templates"');
    expect(skills[4]).toContain('name: "patch-moi:maintain-fork-with-codex-toys"');
    expect(skills[5]).toContain('name: "patch-moi:pickup-runner-candidate"');
  });

  test("ships codex-toys automation template pack", async () => {
    const pack = await readFile(join(repoRoot, "templates/codex-toys/codex-pack.toml"), "utf8");
    const maintain = JSON.parse(await readFile(
      join(repoRoot, "templates/codex-toys/automations/patch-moi-maintain-fork/automation.json"),
      "utf8",
    ));
    const feature = JSON.parse(await readFile(
      join(repoRoot, "templates/codex-toys/automations/patch-moi-feature-candidate/automation.json"),
      "utf8",
    ));

    expect(pack).toContain('name = "patch-moi-codex-toys-templates"');
    expect(pack).toContain('kind = "automation"');
    expect(maintain).toMatchObject({
      name: "patch-moi-maintain-fork",
      script: "exec/start-turn.mts",
      promptFile: "prompt.md",
      cwd: "@",
      config: {
        repo: "fork",
      },
    });
    expect(feature).toMatchObject({
      name: "patch-moi-feature-candidate",
      script: "exec/start-turn.mts",
      promptFile: "prompt.md",
      cwd: "@",
      config: {
        repo: "fork",
      },
    });
  });
});
