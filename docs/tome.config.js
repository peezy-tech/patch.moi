/** @type {import('@tomehq/core').TomeConfig} */
export default {
  name: "patch.moi",
  basePath: "/",
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
        "tutorials/watch-upstream-release",
        "tutorials/run-harness-maintenance-flow",
        "tutorials/dispatch-codex-release-flow",
      ],
    },
    {
      group: "Guides",
      pages: [
        "guides/run-patch-locally",
        "guides/maintain-a-fork",
        "guides/configure-feed-sources",
      ],
    },
    {
      group: "Reference",
      pages: [
        "reference/cli",
        "reference/environment",
        "reference/feed-sources",
        "reference/http-api",
        "reference/dispatch-and-replay-flow-events",
        "reference/jsonl-state",
        "reference/packages",
      ],
    },
    {
      group: "Concepts",
      pages: [
        "concepts/architecture",
        "concepts/git-source-of-truth",
        "concepts/codex-fork-model",
        "concepts/forge-service-mode",
        "concepts/workspaces-and-channels",
        "concepts/flow-boundary",
        "concepts/codex-use-case",
      ],
    },
  ],
  topNav: [
    { label: "patch.moi", href: "https://patch.moi" },
  ],
};
