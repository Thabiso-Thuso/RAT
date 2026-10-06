import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { simpleGit } from "simple-git";

import { isJobRunning, startJob } from "./jobs";
import { readMailmap } from "./mailmap";
import { getRepo, repoDir, repoRoot, updateRepo } from "./repo-store";
import type {
  AnalysisInfo,
  CanonicalAuthor,
  CommitFileStat,
  CommitListItem,
  HistoryCommit,
  HistoryMeta,
  MergedAuthor,
  RepoEntry,
} from "./types";

/**
 * History ingestion: parse the full non-merge history of a repository into
 * a queryable JSONL store (one HistoryCommit per line) plus a summary
 * (history.json), per the metrics spec:
 *   - non-merge commits reachable from HEAD only
 *   - numstat with rename detection at 50%; changes attributed to the NEW
 *     path, deletions recorded as removed lines on their path
 *   - binary files detected by git itself (numstat "-"), stored with null
 *     counts so they are visible but not measured
 *   - committer date drives commit sets; author identity stays raw here
 *     (mailmap merging resolves at query time via lib/mailmap; manual
 *     merging may join it in a later feature)
 */

const HISTORY_META_FILE = "history.json";
const HISTORY_JSONL_FILE = "history.jsonl";

// \x01 separates fields inside the commit header chunk; commits and numstat
// records are NUL-separated via -z (paths are never NUL-terminated inside
// their own record, so this is unambiguous).
const GIT_LOG_FORMAT = "\x01%H\x01%P\x01%an\x01%ae\x01%ct\x01%s";

export function historyMetaPath(repoId: string): string {
  return path.join(repoRoot(repoId), HISTORY_META_FILE);
}

export function historyJsonlPath(repoId: string): string {
  return path.join(repoRoot(repoId), HISTORY_JSONL_FILE);
}

// ---------------------------------------------------------------------------
// Analysis job
// ---------------------------------------------------------------------------

export type StartAnalysisResult =
  | "started"
  | "already-running"
  | "not-ready"
  | "unknown";

/**
 * Start a background analysis for a ready repository. Returns a result the
 * route can translate into a response; the job itself persists terminal
 * state in the registry.
 */
export async function startAnalysis(
  repoId: string,
): Promise<StartAnalysisResult> {
  if (isJobRunning(`analyze:${repoId}`)) return "already-running";
  const entry = await getRepo(repoId);
  if (!entry) return "unknown";
  if (entry.status !== "ready") return "not-ready";
  await updateRepo(repoId, { analysis: { status: "analyzing" } });
  startJob(`analyze:${repoId}`, () => analyzeRepo(repoId));
  return "started";
}

/** Convenience hook for the ingest/clone flows: analyze if the repo made it to ready. */
export async function analyzeIfReady(repoId: string): Promise<void> {
  if (isJobRunning(`analyze:${repoId}`)) return;
  const entry = await getRepo(repoId);
  if (!entry || entry.status !== "ready") return;
  await updateRepo(repoId, { analysis: { status: "analyzing" } });
  startJob(`analyze:${repoId}`, () => analyzeRepo(repoId));
}

/**
 * Job body: run git log, parse it, persist history.jsonl + history.json and
 * mirror the terminal state into the registry entry. Always ends in a
 * terminal analysis state ("ready" or "error").
 */
async function analyzeRepo(repoId: string): Promise<void> {
  try {
    const entry = await getRepo(repoId);
    if (!entry || entry.status !== "ready") return; // deleted meanwhile

    const repoPath = repoDir(repoId);
    const git = simpleGit(repoPath, { config: ["core.quotepath=false"] });
    const headHash = (await git.revparse("HEAD")).trim();

    // Single git process for the whole history. simple-git buffers stdout;
    // fine up to very large histories in this local tool.
    const output = await git.raw([
      "log",
      "--no-merges",
      "-M50%",
      "--numstat",
      "-z",
      `--format=${GIT_LOG_FORMAT}`,
    ]);
    const commits = parseGitLog(output);

    // Bail out if the repo was deleted while git was running, so a deleted
    // repo is not resurrected as an orphan directory by the writes below.
    if (!(await getRepo(repoId))) return;

    const meta = buildMeta(repoId, headHash, commits);

    const jsonlTmp = `${historyJsonlPath(repoId)}.tmp`;
    await fs.writeFile(
      jsonlTmp,
      commits.map((c) => JSON.stringify(c)).join("\n") + "\n",
    );
    await fs.rename(jsonlTmp, historyJsonlPath(repoId));

    const metaTmp = `${historyMetaPath(repoId)}.tmp`;
    await fs.writeFile(metaTmp, JSON.stringify(meta, null, 2));
    await fs.rename(metaTmp, historyMetaPath(repoId));

    await updateRepo(repoId, {
      analysis: {
        status: "ready",
        error: undefined,
        analyzedAt: meta.analyzedAt,
        commitCount: meta.commitCount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRepo(repoId, { analysis: { status: "error", error: message } });
  }
}

// ---------------------------------------------------------------------------
// git log parsing
// ---------------------------------------------------------------------------

/**
 * Parse `git log --no-merges -M50% --numstat -z --format=<GIT_LOG_FORMAT>`
 * output. Verified against git 2.43; the -z record shapes are:
 *   header: "\x01<hash>\x01<parents>\x01<name>\x01<email>\x01<ts>\x01<subject>"
 *   stat:   "<added>\t<removed>\t<path>"          (binary: "-\t-\t<path>")
 *   rename: "<added>\t<removed>\t" + "\0<old>\0<new>"
 * git inserts a newline between a commit's header chunk and its stats (and
 * only there), so leading CR/LF is stripped from every chunk.
 */
export function parseGitLog(output: string): HistoryCommit[] {
  const chunks = output.split("\0");
  const commits: HistoryCommit[] = [];
  let current: HistoryCommit | null = null;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].replace(/^[\r\n]+/, "");
    if (chunk.length === 0) continue;

    if (chunk.includes("\x01")) {
      const parts = chunk.split("\x01");
      // parts[0] is "" because the format starts with \x01.
      if (parts.length !== 7) {
        throw new Error(
          `Unexpected git log header (got ${parts.length} fields): ${chunk.slice(0, 120)}`,
        );
      }
      current = {
        hash: parts[1],
        parents: parts[2].split(" ").filter(Boolean),
        authorName: parts[3],
        authorEmail: parts[4],
        committerTs: Number.parseInt(parts[5], 10),
        subject: parts[6],
        stats: [],
      };
      commits.push(current);
      continue;
    }

    if (!current) continue; // stray chunk before any header

    const statMatch = /^(-|\d+)\t(-|\d+)\t([\s\S]*)$/.exec(chunk);
    if (statMatch) {
      const added = statMatch[1] === "-" ? null : Number.parseInt(statMatch[1], 10);
      const removed = statMatch[2] === "-" ? null : Number.parseInt(statMatch[2], 10);
      if (statMatch[3].length > 0) {
        // Regular change (add / edit / delete / copy target): single chunk.
        current.stats.push({ path: statMatch[3], added, removed });
      } else {
        // Rename: this chunk ends with the tab; the next two chunks are
        // <old> and <new>. Metrics belong to the new path.
        const oldPath = (chunks[i + 1] ?? "").replace(/^[\r\n]+/, "");
        const newPath = (chunks[i + 2] ?? "").replace(/^[\r\n]+/, "");
        if (
          chunks[i + 1] === undefined ||
          chunks[i + 2] === undefined ||
          oldPath.length === 0 ||
          newPath.length === 0
        ) {
          throw new Error("Truncated rename record in git log output");
        }
        const stat: CommitFileStat = { path: newPath, added, removed };
        if (oldPath !== newPath) stat.prevPath = oldPath;
        current.stats.push(stat);
        i += 2;
      }
      continue;
    }

    throw new Error(
      `Unexpected git log chunk (no header/stat match): ${chunk.slice(0, 120)}`,
    );
  }

  return commits;
}

function buildMeta(
  repoId: string,
  headHash: string,
  commits: HistoryCommit[],
): HistoryMeta {
  const authors = new Map<string, { name: string; email: string; commits: number }>();
  let firstTs: number | null = null;
  let lastTs: number | null = null;
  for (const commit of commits) {
    const key = `${commit.authorName} <${commit.authorEmail}>`;
    const author = authors.get(key);
    if (author) author.commits += 1;
    else authors.set(key, { name: commit.authorName, email: commit.authorEmail, commits: 1 });
    if (firstTs === null || commit.committerTs < firstTs) firstTs = commit.committerTs;
    if (lastTs === null || commit.committerTs > lastTs) lastTs = commit.committerTs;
  }
  const authorList = [...authors.values()].sort(
    (a, b) => b.commits - a.commits || a.name.localeCompare(b.name),
  );
  return {
    version: 1,
    repoId,
    analyzedAt: new Date().toISOString(),
    headHash,
    commitCount: commits.length,
    firstCommitterTs: firstTs,
    lastCommitterTs: lastTs,
    authors: authorList,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface CommitQuery {
  /** Inclusive lower committer-ts bound (H(i,j): i). */
  since?: number;
  /** Exclusive upper committer-ts bound (H(i,j): j). */
  until?: number;
  /** Case-insensitive substring match on the canonical (mailmap-resolved)
   *  author name or email, or the raw name or email. */
  author?: string;
  /** Substring match on any changed path (including rename sources). */
  path?: string;
  offset?: number;
  limit?: number;
}

/**
 * Stream history.jsonl and return a filtered, offset/limit window. Newest
 * first (git log order, which is how the file is written). Commits keep
 * their raw (stored) identity and gain `canonicalAuthor` resolved through
 * the repository's current .mailmap.
 */
export async function queryCommits(
  repoId: string,
  query: CommitQuery,
): Promise<{ total: number; commits: CommitListItem[] }> {
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(500, Math.max(1, query.limit ?? 50));
  const authorNeedle = query.author?.toLowerCase();
  const pathNeedle = query.path;
  const mailmap = await readMailmap(repoDir(repoId));

  const matches = (
    commit: HistoryCommit,
    canonical: CanonicalAuthor,
  ): boolean => {
    if (query.since !== undefined && commit.committerTs < query.since) return false;
    if (query.until !== undefined && commit.committerTs >= query.until) return false;
    if (authorNeedle !== undefined && authorNeedle.length > 0) {
      const hit =
        commit.authorName.toLowerCase().includes(authorNeedle) ||
        commit.authorEmail.toLowerCase().includes(authorNeedle) ||
        canonical.name.toLowerCase().includes(authorNeedle) ||
        canonical.email.toLowerCase().includes(authorNeedle);
      if (!hit) return false;
    }
    if (pathNeedle !== undefined && pathNeedle.length > 0) {
      const hit = commit.stats.some(
        (stat) => stat.path.includes(pathNeedle) || stat.prevPath?.includes(pathNeedle),
      );
      if (!hit) return false;
    }
    return true;
  };

  const commits: CommitListItem[] = [];
  let total = 0;
  const fileStream = createReadStream(historyJsonlPath(repoId), { encoding: "utf8" });
  const rl = createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const commit = JSON.parse(line) as HistoryCommit;
    const canonical = mailmap.resolve(commit.authorName, commit.authorEmail);
    if (!matches(commit, canonical)) continue;
    total += 1;
    if (total > offset && commits.length < limit) {
      commits.push({ ...commit, canonicalAuthor: canonical });
    }
  }
  return { total, commits };
}

/**
 * Canonical (mailmap-merged) author list: the raw identities recorded in
 * history.json are resolved through the repository's current .mailmap and
 * their commit counts summed. Sorted by count desc, then name asc.
 */
export async function listMergedAuthors(
  repoId: string,
): Promise<MergedAuthor[]> {
  const meta = await readHistoryMeta(repoId);
  if (!meta) {
    throw new Error("No analyzed history available. Run analysis first.");
  }
  const mailmap = await readMailmap(repoDir(repoId));

  const authors = new Map<string, MergedAuthor>();
  for (const raw of meta.authors) {
    const canonical = mailmap.resolve(raw.name, raw.email);
    const key = `${canonical.name} <${canonical.email}>`;
    const author = authors.get(key);
    if (author) author.commits += raw.commits;
    else authors.set(key, { ...canonical, commits: raw.commits });
  }
  return [...authors.values()].sort(
    (a, b) => b.commits - a.commits || a.name.localeCompare(b.name),
  );
}

export async function readHistoryMeta(
  repoId: string,
): Promise<HistoryMeta | null> {
  try {
    const raw = await fs.readFile(historyMetaPath(repoId), "utf8");
    return JSON.parse(raw) as HistoryMeta;
  } catch {
    return null;
  }
}

/** Current analysis view for a registry entry (missing analysis = unanalyzed). */
export function analysisOf(entry: RepoEntry): AnalysisInfo {
  return entry.analysis ?? { status: "unanalyzed" };
}
