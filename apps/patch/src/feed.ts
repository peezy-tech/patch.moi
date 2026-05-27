import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { notifyDiscord, type DiscordConfig } from "./discord";
import {
  dispatchWorkspaceEventForFeedSignal,
  mergePatchWorkWithAttempt,
  patchAttemptForWorkspaceDispatch,
  type WorkspaceDispatchConfig,
} from "./automation";
import { EventStore, jobForFeedSignal } from "./queue";
import type { FeedEventName, FeedSignal, FeedSourceConfig } from "./types";

type FeedEntry = {
  id: string;
  title: string;
  url?: string;
  author?: string;
  publishedAt: string;
  raw: string;
};

type FeedState = Record<string, {
  lastSeenId?: string;
  lastCheckedAt?: string;
}>;

type FeedPollerConfig = {
  dataDir: string;
  sourcesPath: string;
  discord?: DiscordConfig;
  workspaceBackend?: WorkspaceDispatchConfig;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const defaultIntervalSeconds = 300;

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#34;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .trim();
}

function firstTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1")) : undefined;
}

function firstAttr(block: string, tag: string, attr: string): string | undefined {
  const tagMatch = block.match(new RegExp(`<${tag}\\b([^>]*)>`, "i"));
  if (!tagMatch) return undefined;
  const attrMatch = tagMatch[1].match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
  return attrMatch ? decodeXml(attrMatch[1]) : undefined;
}

function blocks(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`, "gi"))].map((match) => match[0]);
}

export function parseFeedEntries(xml: string): FeedEntry[] {
  const atomEntries = blocks(xml, "entry").map((entry) => {
    const updated = firstTag(entry, "updated") ?? firstTag(entry, "published");
    return {
      id: firstTag(entry, "id") ?? firstAttr(entry, "link", "href") ?? firstTag(entry, "title") ?? "",
      title: firstTag(entry, "title") ?? "Untitled feed entry",
      url: firstAttr(entry, "link", "href"),
      author: firstTag(firstTag(entry, "author") ?? "", "name"),
      publishedAt: updated ?? new Date().toISOString(),
      raw: entry,
    };
  });

  if (atomEntries.length > 0) {
    return atomEntries.filter((entry) => entry.id);
  }

  return blocks(xml, "item").map((item) => {
    const url = firstTag(item, "link");
    return {
      id: firstTag(item, "guid") ?? url ?? firstTag(item, "title") ?? "",
      title: firstTag(item, "title") ?? "Untitled feed item",
      url,
      author: firstTag(item, "author"),
      publishedAt: firstTag(item, "pubDate") ?? new Date().toISOString(),
      raw: item,
    };
  }).filter((entry) => entry.id);
}

export function parseNpmPackageEntries(text: string): FeedEntry[] {
  const parsed = JSON.parse(text) as {
    name?: string;
    time?: Record<string, string>;
    "dist-tags"?: Record<string, string>;
  };
  const packageName = parsed.name ?? "unknown-package";
  const time = parsed.time ?? {};
  return Object.entries(time)
    .filter(([version]) => version !== "created" && version !== "modified")
    .map(([version, publishedAt]) => ({
      id: `npm:${packageName}:${version}`,
      title: version,
      url: `https://www.npmjs.com/package/${encodeURIComponent(packageName)}/v/${encodeURIComponent(version)}`,
      author: "npm",
      publishedAt,
      raw: JSON.stringify({
        packageName,
        version,
        distTags: distTagsForVersion(parsed["dist-tags"] ?? {}, version),
      }),
    }))
    .sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime());
}

function distTagsForVersion(distTags: Record<string, string>, version: string): string[] {
  return Object.entries(distTags)
    .filter(([, tagVersion]) => tagVersion === version)
    .map(([tag]) => tag)
    .sort();
}

function shaFromEntry(entry: FeedEntry): string | undefined {
  const value = entry.url ?? entry.id;
  return value.match(/[0-9a-f]{40}/i)?.[0];
}

function releaseRefFromEntry(source: FeedSourceConfig, entry: FeedEntry): string | undefined {
  const urlTag = releaseTagFromUrl(entry.url);
  if (urlTag) {
    return urlTag;
  }
  if (source.provider === "github") {
    const githubIdTag = entry.id.match(/^tag:github\.com,\d{4}:Repository\/[^/]+\/(.+)$/)?.[1];
    if (githubIdTag) {
      return decodeURIComponent(githubIdTag);
    }
  }
  return entry.title;
}

function releaseTagFromUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    const tagMatch = parsed.pathname.match(/\/releases\/tag\/([^/?#]+)/);
    return tagMatch ? decodeURIComponent(tagMatch[1]) : undefined;
  } catch {
    const tagMatch = url.match(/\/releases\/tag\/([^/?#]+)/);
    return tagMatch ? decodeURIComponent(tagMatch[1]) : undefined;
  }
}

function refFromEntry(source: FeedSourceConfig, entry: FeedEntry): string | undefined {
  if (source.event === "push" && source.repo.defaultBranch) {
    return `refs/heads/${source.repo.defaultBranch}`;
  }
  if (source.event === "release") {
    return releaseRefFromEntry(source, entry);
  }
  return undefined;
}

export function signalFromEntry(source: FeedSourceConfig, entry: FeedEntry): FeedSignal {
  return {
    sourceId: source.id,
    provider: source.provider,
    event: source.event,
    entryId: entry.id,
    title: entry.title,
    url: entry.url,
    author: entry.author,
    publishedAt: new Date(entry.publishedAt).toISOString(),
    repo: source.repo,
    ref: refFromEntry(source, entry),
    sha: shaFromEntry(entry),
    target: source.target,
    raw: {
      id: entry.id,
      title: entry.title,
      url: entry.url,
      author: entry.author,
      publishedAt: entry.publishedAt,
    },
  };
}

export async function loadSources(path: string): Promise<FeedSourceConfig[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as { sources?: FeedSourceConfig[] };
  return parsed.sources ?? [];
}

async function loadState(path: string): Promise<FeedState> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as FeedState;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function saveState(path: string, state: FeedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function unseenEntries(entries: FeedEntry[], lastSeenId?: string): FeedEntry[] {
  if (!lastSeenId) return [];
  const index = entries.findIndex((entry) => entry.id === lastSeenId);
  return (index === -1 ? entries : entries.slice(0, index)).reverse();
}

function entriesForPoll(entries: FeedEntry[], lastSeenId: string | undefined, primeOnly: boolean | undefined): FeedEntry[] {
  if (!lastSeenId) {
    return primeOnly === false ? entries.slice().reverse() : [];
  }
  return unseenEntries(entries, lastSeenId);
}

export async function pollFeedSource(input: {
  source: FeedSourceConfig;
  state: FeedState;
  statePath: string;
  store: EventStore;
  discord?: DiscordConfig;
  workspaceBackend?: WorkspaceDispatchConfig;
  fetchImpl?: FetchLike;
}): Promise<{ signals: FeedSignal[]; jobs: number; automationDispatches: number; primed: boolean }> {
  const response = await (input.fetchImpl ?? fetch)(input.source.url, {
    headers: { accept: "application/json, application/atom+xml, application/rss+xml, application/xml, text/xml;q=0.9" },
  });
  if (!response.ok) {
    throw new Error(`Feed ${input.source.id} returned ${response.status}`);
  }

  const body = await response.text();
  const entries = input.source.provider === "npm" ? parseNpmPackageEntries(body) : parseFeedEntries(body);
  const newestId = entries[0]?.id;
  const previous = input.state[input.source.id];
  const primed = !previous?.lastSeenId;
  const selectedEntries = entriesForPoll(entries, previous?.lastSeenId, input.source.primeOnly);
  const signals: FeedSignal[] = [];
  let jobs = 0;
  let automationDispatches = 0;

  for (const entry of selectedEntries) {
    const signal = signalFromEntry(input.source, entry);
    const job = jobForFeedSignal(signal);
    await input.store.appendFeedSignal(signal);
    if (job) {
      await input.store.appendFeedJob(job);
      jobs += 1;
    }
    const workspaceDispatch = await dispatchWorkspaceEventForFeedSignal(
      signal,
      input.workspaceBackend,
    );
    if (workspaceDispatch.event) {
      await input.store.appendAutomationEvent(workspaceDispatch.event);
    }
    if (workspaceDispatch.record) {
      await input.store.appendWorkspaceDispatch(workspaceDispatch.record);
      if (workspaceDispatch.event) {
        const attempt = patchAttemptForWorkspaceDispatch(
          workspaceDispatch.event,
          workspaceDispatch.record,
          workspaceDispatch.result?.runs,
        );
        await input.store.appendPatchAttempt(attempt);
        await input.store.appendPatchWork(
          mergePatchWorkWithAttempt(
            await input.store.getPatchWork(attempt.workId),
            workspaceDispatch.event,
            attempt,
          ),
        );
      }
      if (workspaceDispatch.record.status === "dispatched") {
        automationDispatches += 1;
      }
    }
    await notifyDiscord(input.discord ?? { enabled: false, notifyEvents: new Set() }, { signal, job });
    signals.push(signal);
    console.log(JSON.stringify({
      type: "feed.accepted",
      sourceId: signal.sourceId,
      provider: signal.provider,
      event: signal.event,
      entryId: signal.entryId,
      job: job?.id,
      automationEvent: workspaceDispatch.event?.id,
      workspaceDispatch: workspaceDispatch.record?.status,
    }));
  }

  if (newestId) {
    input.state[input.source.id] = {
      lastSeenId: newestId,
      lastCheckedAt: new Date().toISOString(),
    };
    await saveState(input.statePath, input.state);
  }

  return { signals, jobs, automationDispatches, primed };
}

export async function pollFeedsOnce(config: FeedPollerConfig, fetchImpl?: FetchLike): Promise<void> {
  const sources = await loadSources(config.sourcesPath);
  const statePath = join(config.dataDir, "feed-state.json");
  const state = await loadState(statePath);
  const store = new EventStore(config.dataDir);

  for (const source of sources) {
    try {
      await pollFeedSource({
        source,
        state,
        statePath,
        store,
        discord: config.discord,
        workspaceBackend: config.workspaceBackend,
        fetchImpl,
      });
    } catch (error) {
      console.error(JSON.stringify({
        type: "feed.poll_failed",
        sourceId: source.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
}

export async function startFeedPolling(config: FeedPollerConfig): Promise<void> {
  const sources = await loadSources(config.sourcesPath);
  if (sources.length === 0) return;

  await pollFeedsOnce(config);
  const intervalSeconds = Math.min(...sources.map((source) => Math.max(30, source.pollIntervalSeconds ?? defaultIntervalSeconds)));
  setInterval(() => {
    pollFeedsOnce(config).catch((error) => {
      console.error(JSON.stringify({ type: "feed.poll_loop_failed", error: error instanceof Error ? error.message : String(error) }));
    });
  }, intervalSeconds * 1000);
}
