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
    const skills = await Promise.all([
      readFile(join(repoRoot, "skills/maintain-fork/SKILL.md"), "utf8"),
      readFile(join(repoRoot, "skills/triage-attempt/SKILL.md"), "utf8"),
      readFile(join(repoRoot, "skills/inspect-upstream-release/SKILL.md"), "utf8"),
    ]);

    expect(skills[0]).toContain('name: "patch-moi:maintain-fork"');
    expect(skills[1]).toContain('name: "patch-moi:triage-attempt"');
    expect(skills[2]).toContain('name: "patch-moi:inspect-upstream-release"');
  });
});
