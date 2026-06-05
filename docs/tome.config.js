/** @type {import('@tomehq/core').TomeConfig} */
export default {
	name: "patch.moi",
	basePath: "/docs",
	theme: {
		preset: "editorial",
		mode: "auto",
		accent: "#0f766e",
	},
	navigation: [
		{ group: "Overview", pages: ["index"] },
		{
			group: "Primitives",
			pages: [
				"primitives/upstream",
				"primitives/patch-refs",
				"primitives/maintained-branches",
				"primitives/candidate-refs",
				"primitives/safety-gates",
			],
		},
		{
			group: "Components",
			pages: [
				"components/cli",
				"components/mcp",
				"components/codex-plugin",
				"components/templates",
				"components/config",
			],
		},
		{
			group: "Guides",
			pages: [
				"guides/setup-fork",
				"guides/develop-feature-patch",
				"guides/share-patch",
				"guides/maintain-fork",
				"guides/pick-up-candidate",
				"guides/codex-toys-workflows",
			],
		},
		{
			group: "Operations",
			pages: [
				"operations/git-hygiene",
				"operations/plugins",
			],
		},
		{
			group: "Reference",
			pages: [
				"reference/commands",
				"reference/environment",
				"reference/packages",
			],
		},
	],
	topNav: [
		{ label: "Site", href: "https://patch.moi/" },
		{ label: "GitHub", href: "https://github.com/peezy-tech/patch.moi" },
	],
};
