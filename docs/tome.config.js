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
        "tutorials/watch-upstream-release",
        "tutorials/dispatch-codex-release-flow",
      ],
    },
    {
      group: "Guides",
      pages: [
        "guides/run-patch-locally",
        "guides/configure-feed-sources",
        "guides/dispatch-and-replay-flow-events",
        "guides/enable-discord-output",
      ],
    },
    {
      group: "Reference",
      pages: [
        "reference/environment",
        "reference/feed-sources",
        "reference/http-api",
        "reference/jsonl-state",
        "reference/packages",
      ],
    },
    {
      group: "Concepts",
      pages: [
        "concepts/architecture",
        "concepts/flow-boundary",
        "concepts/upstream-use-cases",
        "concepts/forgejo-forking-problem-space",
      ],
    },
  ],
  topNav: [
    { label: "patch.moi", href: "https://patch.moi" },
  ],
};
