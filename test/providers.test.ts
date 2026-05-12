import { describe, expect, test } from "bun:test";
import { normalizeGithubEvent } from "../src/providers/github";
import { normalizeJojoEvent } from "../src/providers/jojo";

const repository = {
  name: "git-webhooks",
  full_name: "peezy-tech/git-webhooks",
  clone_url: "https://example.test/peezy-tech/git-webhooks.git",
  ssh_url: "git@example.test:peezy-tech/git-webhooks.git",
  default_branch: "main",
  owner: { login: "peezy-tech" },
};

describe("provider normalization", () => {
  test("normalizes GitHub push events", () => {
    const event = normalizeGithubEvent({
      providerEvent: "push",
      deliveryId: "delivery-1",
      receivedAt: "2026-05-12T00:00:00.000Z",
      payload: {
        ref: "refs/heads/main",
        before: "before",
        after: "after",
        repository,
        sender: { login: "peezy", html_url: "https://github.com/peezy" },
      },
    });

    expect(event.provider).toBe("github");
    expect(event.event).toBe("push");
    expect(event.repo?.fullName).toBe("peezy-tech/git-webhooks");
    expect(event.sender?.username).toBe("peezy");
  });

  test("normalizes jojo push events", () => {
    const event = normalizeJojoEvent({
      providerEvent: "push",
      deliveryId: "delivery-2",
      receivedAt: "2026-05-12T00:00:00.000Z",
      payload: {
        ref: "refs/heads/main",
        before: "before",
        after: "after",
        repository,
        sender: { username: "peezy", html_url: "https://jojo.build/peezy" },
      },
    });

    expect(event.provider).toBe("jojo");
    expect(event.event).toBe("push");
    expect(event.repo?.owner).toBe("peezy-tech");
    expect(event.sender?.username).toBe("peezy");
  });
});
