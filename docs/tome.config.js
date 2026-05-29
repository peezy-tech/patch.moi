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
      group: "Tutorials",
      pages: [
        "tutorials/develop-feature-patch-work",
        "tutorials/watch-upstream-release",
      ],
    },
    {
      group: "Guides",
      pages: [
        "guides/run-patch-locally",
        "guides/maintain-a-fork",
        "guides/codex-flows-templates",
      ],
    },
    {
      group: "Reference",
      pages: [
        "reference/cli",
        "reference/environment",
        "reference/packages",
      ],
    },
    {
      group: "Concepts",
      pages: [
        "concepts/architecture",
        "concepts/git-source-of-truth",
        "concepts/codex-fork-model",
        "concepts/flow-boundary",
        "concepts/codex-use-case",
      ],
    },
  ],
  topNav: [
    { label: "patch.moi", href: "https://patch.moi/" },
  ],
};
