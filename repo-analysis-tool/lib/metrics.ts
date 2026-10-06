import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import { historyJsonlPath, readHistoryMeta } from "./history";
import { readMailmap } from "./mailmap";
import { repoDir } from "./repo-store";
import type { CanonicalAuthor, HistoryCommit } from "./types";

/**
 * Metrics engine (COMS3011A spec), computed over the ingested non-merge
 * history (H̄). Everything streams history.jsonl in one pass:
 *   - per file o:   l+ = Σ added, l- = Σ removed, δ = l+ - l-, λ = l+ + l-,
 *                   n(H,o) = |{h ∈ H : λ(h,o) > 0}|, η = n/|H|, ρ = λ/|H|
 *   - directories:  sums over IMMEDIATE children (files + subdirs), which
 *                   equals summing every descendant file stat
 *   - repository:   the root directory
 *   - commit set:   same sums over all of H; n(H) = commits with λ(h) > 0
 *   - authors:      I(a,h) = 1 iff a = h[a] AFTER mailmap merging; per-author
 *                   sums plus ownership ω(H,o,a) = λ(H,o,a)/λ(H,o)
 * Binary files (git's own numstat "-") are never measured but stay visible in
 * H[F] = ⋃(h[F] ∪ h[p][F]); renames attribute to the NEW path (the parser
 * already stored them that way); deletions are removed lines on their path.
 * Commit sets filter on COMMITTER date: since ≤ ts < until (Ht = until-only).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricFilters {
  /** Case-insensitive substring on the canonical (or raw) author name/email. */
  author?: string;
  /** Inclusive lower committer-ts bound (H(i,j): i). */
  since?: number;
  /** Exclusive upper committer-ts bound (H(i,j): j; Ht: t + 1s). */
  until?: number;
}

/** Sums shared by files, directories, and commit sets. */
export interface MetricSums {
  added: number;
  removed: number;
  growth: number;
  churn: number;
}

export interface FileMetrics extends MetricSums {
  path: string;
  /** Commits with λ(h,o) > 0 (n(H,o)). */
  modifications: number;
  /** All commits touching o, including binary-only touches. */
  commits: number;
  /** Touches where git reported the file as binary (never measured). */
  binaryCommits: number;
}

export interface DirectoryMetrics extends MetricSums {
  /** "" is the repository root; otherwise the exact directory path. */
  path: string;
  /** Commits with λ(h,d) > 0 (n(H,d)). */
  modifications: number;
  /** Commits touching anything under d (binary touches included). */
  commits: number;
  /** Distinct files ever changed under d (visible universe). */
  fileCount: number;
}

export interface AuthorMetrics extends MetricSums {
  /** Canonical "name <email>" key after mailmap merging. */
  key: string;
  name: string;
  email: string;
  /** Commits authored in H (|{h ∈ H : I(a,h) = 1}|). */
  commits: number;
  /** Commits with λ(h) > 0 (n(H,a)). */
  modifications: number;
}

/** Commit-set metrics: the spec's |H|, n(H), η, ρ plus the global sums. */
export interface CommitSetMetrics extends MetricSums {
  /** |H| — commits passing the filters. */
  commitCount: number;
  /** n(H) — commits with λ(h) > 0. */
  modifications: number;
  /** η(H) = n(H)/|H| (0 when |H| = 0). */
  modificationFrequency: number;
  /** ρ(H) = λ(H)/|H| (0 when |H| = 0). */
  churnRate: number;
  /** H[F] universe: files ever changed (incl. rename sources, binary). */
  fileCount: number;
  /** Files with at least one measured (non-binary) change. */
  measuredFileCount: number;
  directoryCount: number;
  authorCount: number;
  firstCommitterTs: number | null;
  lastCommitterTs: number | null;
}

export interface TimelineBucket {
  /** "YYYY-MM" (committer time, UTC). */
  month: string;
  commits: number;
  added: number;
  removed: number;
}

export type MetricsSortKey =
  | "path"
  | "commits"
  | "added"
  | "removed"
  | "growth"
  | "churn"
  | "modifications";

export interface ListOptions {
  search?: string;
  sort?: MetricsSortKey;
  order?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;

export class MetricsNotReadyError extends Error {
  constructor() {
    super("No analyzed history available. Run analysis first.");
    this.name = "MetricsNotReadyError";
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Load .mailmap-resolved canonical author key ("name <email>"). */
function authorKeyOf(canonical: CanonicalAuthor): string {
  return `${canonical.name} <${canonical.email}>`;
}

/** Ancestor directories of a path; "" (root) first, immediate parent last. */
function ancestorDirs(filePath: string): string[] {
  const dirs: string[] = [""];
  let index = filePath.indexOf("/");
  while (index !== -1) {
    dirs.push(filePath.slice(0, index));
    index = filePath.indexOf("/", index + 1);
  }
  return dirs;
}

/** Immediate parent directory of a file path ("" = root). */
export function parentDir(filePath: string): string {
  const cut = filePath.lastIndexOf("/");
  return cut === -1 ? "" : filePath.slice(0, cut);
}

/** Month bucket "YYYY-MM" of a unix timestamp. */
function monthOf(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(0, 7);
}

export function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Accepts unix seconds ("1700000000") or a date ("2024-01-31", UTC midnight;
 * full ISO strings also work). Used by API routes and pages to translate
 * query input into MetricFilters bounds.
 */
export function parseMetricDate(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (/^-?\d+$/.test(trimmed)) {
    const value = Number.parseInt(trimmed, 10);
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00:00Z` : trimmed,
  );
  return Number.isNaN(parsed) ? null : Math.floor(parsed / 1000);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SORT_KEYS: ReadonlySet<string> = new Set([
  "path",
  "commits",
  "added",
  "removed",
  "growth",
  "churn",
  "modifications",
]);

/** Read ListOptions from a searchParams-like object (list endpoints). */
export function listOptionsFromParams(params: {
  [key: string]: string | string[] | undefined;
}): ListOptions {
  const options: ListOptions = {};
  const search = firstParam(params.search)?.trim();
  if (search) options.search = search;
  const sort = firstParam(params.sort);
  if (sort && SORT_KEYS.has(sort)) options.sort = sort as MetricsSortKey;
  const order = firstParam(params.order);
  if (order === "asc" || order === "desc") options.order = order;
  const offset = firstParam(params.offset);
  if (offset && /^\d+$/.test(offset)) options.offset = Number.parseInt(offset, 10);
  const limit = firstParam(params.limit);
  if (limit && /^\d+$/.test(limit)) options.limit = Number.parseInt(limit, 10);
  return options;
}

/** Read MetricFilters from a searchParams-like object (pages + API routes). */
export function filtersFromParams(params: {
  [key: string]: string | string[] | undefined;
}): MetricFilters {
  const filters: MetricFilters = {};
  const author = firstParam(params.author)?.trim();
  if (author) filters.author = author;
  for (const key of ["since", "until"] as const) {
    const raw = firstParam(params[key]);
    if (raw) {
      const parsed = parseMetricDate(raw);
      if (parsed !== null) filters[key] = parsed;
    }
  }
  return filters;
}

function clampPage(options: ListOptions): { offset: number; limit: number } {
  return {
    offset: Math.max(0, options.offset ?? 0),
    limit: Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, options.limit ?? DEFAULT_PAGE_SIZE),
    ),
  };
}

function commitMatchesFilters(
  commit: HistoryCommit,
  canonical: CanonicalAuthor,
  filters: MetricFilters,
): boolean {
  if (filters.since !== undefined && commit.committerTs < filters.since) {
    return false;
  }
  if (filters.until !== undefined && commit.committerTs >= filters.until) {
    return false;
  }
  const needle = filters.author?.toLowerCase();
  if (needle !== undefined && needle.length > 0) {
    const hit =
      canonical.name.toLowerCase().includes(needle) ||
      canonical.email.toLowerCase().includes(needle) ||
      commit.authorName.toLowerCase().includes(needle) ||
      commit.authorEmail.toLowerCase().includes(needle);
    if (!hit) return false;
  }
  return true;
}

function sortValue(item: object, key: MetricsSortKey): string | number {
  const value = (item as Record<MetricsSortKey, unknown>)[key];
  return typeof value === "number" ? value : String(value ?? "");
}

/** Comparator over the sortable metric fields ("path" is the string one). */
function compareBy<T extends object>(
  sort: MetricsSortKey,
  order: "asc" | "desc",
): (a: T, b: T) => number {
  const factor = order === "asc" ? 1 : -1;
  return (a, b) => {
    const va = sortValue(a, sort);
    const vb = sortValue(b, sort);
    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * factor;
    }
    return String(va).localeCompare(String(vb)) * factor;
  };
}

// ---------------------------------------------------------------------------
// Core scan
// ---------------------------------------------------------------------------

interface FileAcc {
  added: number;
  removed: number;
  commits: number;
  modifications: number;
  binaryCommits: number;
}

interface DirAcc {
  added: number;
  removed: number;
  commits: number;
  modifications: number;
  files: Set<string>;
}

interface AuthorAcc {
  name: string;
  email: string;
  commits: number;
  added: number;
  removed: number;
  modifications: number;
}

interface ScanResult {
  totals: CommitSetMetrics;
  files: Map<string, FileAcc>;
  dirs: Map<string, DirAcc>;
  authors: Map<string, AuthorAcc>;
  timeline: TimelineBucket[];
}

/** Accumulators to populate; disabled ones save memory on large histories. */
interface ScanOptions {
  files?: boolean;
  dirs?: boolean;
  authors?: boolean;
  timeline?: boolean;
}

async function scanHistory(
  repoId: string,
  filters: MetricFilters,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const meta = await readHistoryMeta(repoId);
  if (!meta) throw new MetricsNotReadyError();

  const collect = {
    files: options.files ?? true,
    dirs: options.dirs ?? true,
    authors: options.authors ?? true,
    timeline: options.timeline ?? true,
  };
  const mailmap = await readMailmap(repoDir(repoId));

  const files = new Map<string, FileAcc>();
  const dirs = new Map<string, DirAcc>();
  const authors = new Map<string, AuthorAcc>();
  const timelineMap = new Map<string, TimelineBucket>();
  const visibleFiles = new Set<string>();
  const measuredFiles = new Set<string>();

  let commitCount = 0;
  let commitsWithMods = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let firstTs: number | null = null;
  let lastTs: number | null = null;

  const stream = createReadStream(historyJsonlPath(repoId), { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const commit = JSON.parse(line) as HistoryCommit;
    const canonical = mailmap.resolve(commit.authorName, commit.authorEmail);
    if (!commitMatchesFilters(commit, canonical, filters)) continue;

    commitCount += 1;
    if (firstTs === null || commit.committerTs < firstTs) firstTs = commit.committerTs;
    if (lastTs === null || commit.committerTs > lastTs) lastTs = commit.committerTs;

    // Author accumulation (independent of whether the commit measures).
    if (collect.authors) {
      const key = authorKeyOf(canonical);
      let author = authors.get(key);
      if (!author) {
        author = {
          name: canonical.name,
          email: canonical.email,
          commits: 0,
          added: 0,
          removed: 0,
          modifications: 0,
        };
        authors.set(key, author);
      }
      author.commits += 1;
    }

    if (collect.timeline) {
      const month = monthOf(commit.committerTs);
      let bucket = timelineMap.get(month);
      if (!bucket) {
        bucket = { month, commits: 0, added: 0, removed: 0 };
        timelineMap.set(month, bucket);
      }
      bucket.commits += 1;
    }

    // Per-commit bookkeeping; numstat paths are unique per commit, so file
    // accumulators need no dedupe, but directory ones do (a commit touching
    // several files of one directory must count that directory once).
    let commitAdded = 0;
    let commitRemoved = 0;
    const dirsTouched = new Set<string>();
    const dirsMeasured = new Set<string>();

    for (const stat of commit.stats) {
      visibleFiles.add(stat.path);
      if (stat.prevPath !== undefined) visibleFiles.add(stat.prevPath);

      const added = stat.added;
      const removed = stat.removed;
      const binary = added === null || removed === null;

      if (collect.files) {
        let file = files.get(stat.path);
        if (!file) {
          file = {
            added: 0,
            removed: 0,
            commits: 0,
            modifications: 0,
            binaryCommits: 0,
          };
          files.set(stat.path, file);
        }
        file.commits += 1;
        if (binary) {
          file.binaryCommits += 1;
        } else {
          file.added += added;
          file.removed += removed;
          // n(H,o) counts commits with λ(h,o) > 0 — a pure rename (0/0) is
          // attributed to the new path but is not a modification.
          if (added > 0 || removed > 0) file.modifications += 1;
        }
      }

      if (collect.dirs) {
        for (const dir of ancestorDirs(stat.path)) {
          let acc = dirs.get(dir);
          if (!acc) {
            acc = {
              added: 0,
              removed: 0,
              commits: 0,
              modifications: 0,
              files: new Set<string>(),
            };
            dirs.set(dir, acc);
          }
          acc.files.add(stat.path);
          dirsTouched.add(dir);
          if (!binary) {
            acc.added += added;
            acc.removed += removed;
            if (added > 0 || removed > 0) dirsMeasured.add(dir);
          }
        }
      }

      if (!binary) {
        commitAdded += added;
        commitRemoved += removed;
        measuredFiles.add(stat.path);
      }
    }

    if (collect.dirs) {
      for (const dir of dirsTouched) dirs.get(dir)!.commits += 1;
    }
    if (commitAdded > 0 || commitRemoved > 0) {
      commitsWithMods += 1;
      if (collect.authors) {
        const key = authorKeyOf(canonical);
        const author = authors.get(key)!;
        author.modifications += 1;
        author.added += commitAdded;
        author.removed += commitRemoved;
      }
      if (collect.timeline) {
        const bucket = timelineMap.get(monthOf(commit.committerTs))!;
        bucket.added += commitAdded;
        bucket.removed += commitRemoved;
      }
      if (collect.dirs) {
        for (const dir of dirsMeasured) dirs.get(dir)!.modifications += 1;
      }
    }
    totalAdded += commitAdded;
    totalRemoved += commitRemoved;
  }

  const totals: CommitSetMetrics = {
    added: totalAdded,
    removed: totalRemoved,
    growth: totalAdded - totalRemoved,
    churn: totalAdded + totalRemoved,
    commitCount,
    modifications: commitsWithMods,
    modificationFrequency: ratio(commitsWithMods, commitCount),
    churnRate: ratio(totalAdded + totalRemoved, commitCount),
    fileCount: visibleFiles.size,
    measuredFileCount: measuredFiles.size,
    directoryCount: dirs.size,
    authorCount: authors.size,
    firstCommitterTs: firstTs,
    lastCommitterTs: lastTs,
  };

  return {
    totals,
    files,
    dirs,
    authors,
    timeline: [...timelineMap.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface RepositoryMetrics {
  totals: CommitSetMetrics;
  timeline: TimelineBucket[];
  topFiles: FileMetrics[];
  topAuthors: AuthorMetrics[];
}

/** Repository-level metrics (the root directory) for a commit set. */
export async function getRepositoryMetrics(
  repoId: string,
  filters: MetricFilters = {},
): Promise<RepositoryMetrics> {
  const scan = await scanHistory(repoId, filters);
  const toFile = (path: string, acc: FileAcc): FileMetrics => ({
    path,
    added: acc.added,
    removed: acc.removed,
    growth: acc.added - acc.removed,
    churn: acc.added + acc.removed,
    modifications: acc.modifications,
    commits: acc.commits,
    binaryCommits: acc.binaryCommits,
  });
  const toAuthor = (key: string, acc: AuthorAcc): AuthorMetrics => ({
    key,
    name: acc.name,
    email: acc.email,
    commits: acc.commits,
    added: acc.added,
    removed: acc.removed,
    growth: acc.added - acc.removed,
    churn: acc.added + acc.removed,
    modifications: acc.modifications,
  });
  const topFiles = [...scan.files.entries()]
    .map(([path, acc]) => toFile(path, acc))
    .sort(compareBy("churn", "desc"))
    .slice(0, 8);
  const topAuthors = [...scan.authors.entries()]
    .map(([key, acc]) => toAuthor(key, acc))
    .sort(compareBy("churn", "desc"))
    .slice(0, 8);
  return { totals: scan.totals, timeline: scan.timeline, topFiles, topAuthors };
}

export interface MetricsListResult<T> {
  totals: CommitSetMetrics;
  total: number;
  offset: number;
  limit: number;
  items: T[];
}

/** Paginated, sortable file metrics for a commit set. */
export async function getFileMetricsList(
  repoId: string,
  filters: MetricFilters = {},
  options: ListOptions = {},
): Promise<MetricsListResult<FileMetrics>> {
  const scan = await scanHistory(repoId, filters, { dirs: false, authors: false, timeline: false });
  const search = options.search?.toLowerCase();
  let items = [...scan.files.entries()].map(([path, acc]) => ({
    path,
    added: acc.added,
    removed: acc.removed,
    growth: acc.added - acc.removed,
    churn: acc.added + acc.removed,
    modifications: acc.modifications,
    commits: acc.commits,
    binaryCommits: acc.binaryCommits,
  }));
  if (search) items = items.filter((f) => f.path.toLowerCase().includes(search));
  items.sort(compareBy(options.sort ?? "churn", options.order ?? "desc"));
  const { offset, limit } = clampPage(options);
  return {
    totals: scan.totals,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
  };
}

/** Paginated, sortable directory metrics (recursive sums, immediate-child semantics). */
export async function getDirectoryMetricsList(
  repoId: string,
  filters: MetricFilters = {},
  options: ListOptions = {},
): Promise<MetricsListResult<DirectoryMetrics>> {
  const scan = await scanHistory(repoId, filters, { files: false, authors: false, timeline: false });
  const search = options.search?.toLowerCase();
  let items = [...scan.dirs.entries()]
    .filter(([path]) => path.length > 0) // root == repository metrics page
    .map(([path, acc]) => ({
      path,
      added: acc.added,
      removed: acc.removed,
      growth: acc.added - acc.removed,
      churn: acc.added + acc.removed,
      modifications: acc.modifications,
      commits: acc.commits,
      fileCount: acc.files.size,
    }));
  if (search) items = items.filter((d) => d.path.toLowerCase().includes(search));
  items.sort(compareBy(options.sort ?? "churn", options.order ?? "desc"));
  const { offset, limit } = clampPage(options);
  return {
    totals: scan.totals,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
  };
}

/** Paginated, sortable author metrics for a commit set (post-mailmap). */
export async function getAuthorMetricsList(
  repoId: string,
  filters: MetricFilters = {},
  options: ListOptions = {},
): Promise<MetricsListResult<AuthorMetrics & { path: string }>> {
  const scan = await scanHistory(repoId, filters, { files: false, dirs: false, timeline: false });
  const search = options.search?.toLowerCase();
  let items = [...scan.authors.entries()].map(([key, acc]) => ({
    key,
    name: acc.name,
    email: acc.email,
    // "path" aliases the display name so the shared sort plumbing can
    // order authors alphabetically via the same "path" sort key.
    path: acc.name,
    commits: acc.commits,
    added: acc.added,
    removed: acc.removed,
    growth: acc.added - acc.removed,
    churn: acc.added + acc.removed,
    modifications: acc.modifications,
  }));
  if (search) {
    items = items.filter(
      (a) =>
        a.name.toLowerCase().includes(search) ||
        a.email.toLowerCase().includes(search),
    );
  }
  items.sort(compareBy(options.sort ?? "churn", options.order ?? "desc"));
  const { offset, limit } = clampPage(options);
  return {
    totals: scan.totals,
    total: items.length,
    offset,
    limit,
    items: items.slice(offset, offset + limit),
  };
}

// ---------------------------------------------------------------------------
// Detail queries (focused scans)
// ---------------------------------------------------------------------------

export interface FileAuthorBreakdown extends MetricSums {
  key: string;
  name: string;
  email: string;
  modifications: number;
  /** λ(H,o,a)/λ(H,o). */
  ownership: number;
}

export interface FileCommitSample {
  hash: string;
  subject: string;
  committerTs: number;
  added: number | null;
  removed: number | null;
  /** Set when this record is a rename and `path` is the NEW path. */
  prevPath?: string;
}

export interface FileDetail {
  path: string;
  exists: boolean;
  /** |H| of the same filtered commit set (denominator for η and ρ). */
  commitCount: number;
  metrics: FileMetrics | null;
  /** Canonical authors with ownership ω(H,o,a) for this file. */
  authors: FileAuthorBreakdown[];
  /** Latest touching commits (newest first, capped). */
  commits: FileCommitSample[];
  /** Paths this file was renamed TO within H (its records as prevPath). */
  renamedTo: string[];
}

export async function getFileDetail(
  repoId: string,
  filePath: string,
  filters: MetricFilters = {},
  commitSampleSize = 20,
): Promise<FileDetail> {
  const meta = await readHistoryMeta(repoId);
  if (!meta) throw new MetricsNotReadyError();
  const mailmap = await readMailmap(repoDir(repoId));

  const acc: FileAcc = {
    added: 0,
    removed: 0,
    commits: 0,
    modifications: 0,
    binaryCommits: 0,
  };
  const perAuthor = new Map<string, FileAuthorBreakdown & { added: number; removed: number }>();
  const commits: FileCommitSample[] = [];
  const renamedTo = new Set<string>();
  let commitCount = 0;

  const stream = createReadStream(historyJsonlPath(repoId), { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const commit = JSON.parse(line) as HistoryCommit;
    const canonical = mailmap.resolve(commit.authorName, commit.authorEmail);
    if (!commitMatchesFilters(commit, canonical, filters)) continue;
    commitCount += 1;

    for (const stat of commit.stats) {
      const isTarget = stat.path === filePath;
      const isRenameSource = stat.prevPath === filePath;
      if (!isTarget && !isRenameSource) continue;
      if (isRenameSource && stat.path !== filePath) renamedTo.add(stat.path);
      if (!isTarget) continue;

      acc.commits += 1;
      if (stat.added === null || stat.removed === null) {
        acc.binaryCommits += 1;
      } else {
        acc.added += stat.added;
        acc.removed += stat.removed;
        if (stat.added > 0 || stat.removed > 0) acc.modifications += 1;
        const key = authorKeyOf(canonical);
        let author = perAuthor.get(key);
        if (!author) {
          author = {
            key,
            name: canonical.name,
            email: canonical.email,
            added: 0,
            removed: 0,
            growth: 0,
            churn: 0,
            modifications: 0,
            ownership: 0,
          };
          perAuthor.set(key, author);
        }
        author.added += stat.added;
        author.removed += stat.removed;
        if (stat.added > 0 || stat.removed > 0) author.modifications += 1;
      }
      if (commits.length < commitSampleSize) {
        commits.push({
          hash: commit.hash,
          subject: commit.subject,
          committerTs: commit.committerTs,
          added: stat.added,
          removed: stat.removed,
          ...(stat.prevPath !== undefined ? { prevPath: stat.prevPath } : {}),
        });
      }
    }
  }

  const churn = acc.added + acc.removed;
  const authors = [...perAuthor.values()]
    .map((author) => ({
      ...author,
      growth: author.added - author.removed,
      churn: author.added + author.removed,
      ownership: ratio(author.added + author.removed, churn),
    }))
    .sort(compareBy("churn", "desc"));

  return {
    path: filePath,
    exists: acc.commits > 0 || renamedTo.size > 0,
    commitCount,
    metrics:
      acc.commits > 0
        ? {
            path: filePath,
            added: acc.added,
            removed: acc.removed,
            growth: acc.added - acc.removed,
            churn,
            modifications: acc.modifications,
            commits: acc.commits,
            binaryCommits: acc.binaryCommits,
          }
        : null,
    authors,
    commits,
    renamedTo: [...renamedTo].sort(),
  };
}

export interface AuthorFileOwnership extends MetricSums {
  path: string;
  modifications: number;
  /** λ(H,o,a)/λ(H,o) for this author on this file. */
  ownership: number;
}

export interface AuthorDetail {
  key: string;
  name: string;
  email: string;
  /** |H| of the date-filtered commit set (denominator for η). */
  commitCount: number;
  metrics: Omit<AuthorMetrics, "key" | "name" | "email"> & {
    /** λ(H,a)/λ(H) across the commit set. */
    ownership: number;
  };
  /** Files this author changed, with per-file ownership. */
  files: AuthorFileOwnership[];
  /** Latest commits authored (newest first, capped). */
  commits: FileCommitSample[];
}

export async function getAuthorDetail(
  repoId: string,
  authorKey: string,
  filters: MetricFilters = {},
  commitSampleSize = 20,
): Promise<AuthorDetail> {
  const meta = await readHistoryMeta(repoId);
  if (!meta) throw new MetricsNotReadyError();
  const mailmap = await readMailmap(repoDir(repoId));

  let name = "";
  let email = "";
  let commits = 0;
  let modifications = 0;
  let added = 0;
  let removed = 0;
  let commitCount = 0;
  const perFile = new Map<string, { added: number; removed: number; modifications: number }>();
  const commitSamples: FileCommitSample[] = [];

  const stream = createReadStream(historyJsonlPath(repoId), { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.length === 0) continue;
    const commit = JSON.parse(line) as HistoryCommit;
    // Date bounds define the commit set |H| (counted across ALL authors);
    // the key selects the author within it.
    if (
      (filters.since !== undefined && commit.committerTs < filters.since) ||
      (filters.until !== undefined && commit.committerTs >= filters.until)
    ) {
      continue;
    }
    commitCount += 1;
    const canonical = mailmap.resolve(commit.authorName, commit.authorEmail);
    if (authorKeyOf(canonical) !== authorKey) continue;

    if (name.length === 0) {
      name = canonical.name;
      email = canonical.email;
    }
    commits += 1;
    let commitAdded = 0;
    let commitRemoved = 0;
    for (const stat of commit.stats) {
      if (stat.added === null || stat.removed === null) continue; // binary
      commitAdded += stat.added;
      commitRemoved += stat.removed;
      let file = perFile.get(stat.path);
      if (!file) {
        file = { added: 0, removed: 0, modifications: 0 };
        perFile.set(stat.path, file);
      }
      file.added += stat.added;
      file.removed += stat.removed;
      if (stat.added > 0 || stat.removed > 0) file.modifications += 1;
    }
    if (commitAdded > 0 || commitRemoved > 0) modifications += 1;
    added += commitAdded;
    removed += commitRemoved;
    if (commitSamples.length < commitSampleSize) {
      commitSamples.push({
        hash: commit.hash,
        subject: commit.subject,
        committerTs: commit.committerTs,
        added: commit.stats.some((s) => s.added !== null)
          ? commit.stats.reduce((sum, s) => sum + (s.added ?? 0), 0)
          : null,
        removed: commit.stats.some((s) => s.removed !== null)
          ? commit.stats.reduce((sum, s) => sum + (s.removed ?? 0), 0)
          : null,
      });
    }
  }

  if (commits === 0) {
    throw new Error(`Unknown author: ${authorKey}`);
  }

  const churn = added + removed;
  const files = [...perFile.entries()]
    .map(([path, fileAcc]) => ({
      path,
      added: fileAcc.added,
      removed: fileAcc.removed,
      growth: fileAcc.added - fileAcc.removed,
      churn: fileAcc.added + fileAcc.removed,
      modifications: fileAcc.modifications,
      // True ownership needs λ(H,o) for every file; that is a second scan.
      // ω here is the author's share of THEIR OWN file churn vs the file's
      // churn, filled in by the caller when λ(H,o) is available — see
      // getAuthorDetailWithOwnership.
      ownership: 0,
    }))
    .sort(compareBy("churn", "desc"));

  return {
    key: authorKey,
    name,
    email,
    commitCount,
    metrics: {
      commits,
      added,
      removed,
      growth: added - removed,
      churn,
      modifications,
      ownership: 0,
    },
    files,
    commits: commitSamples,
  };
}

/**
 * Author detail with true per-file ownership ω(H,o,a) = λ(H,o,a)/λ(H,o):
 * runs the focused author scan, then one file-list scan for λ(H,o).
 */
export async function getAuthorDetailWithOwnership(
  repoId: string,
  authorKey: string,
  filters: MetricFilters = {},
): Promise<AuthorDetail> {
  // Cheap pre-pass: only files this author touched need λ(H,o).
  const detail = await getAuthorDetail(repoId, authorKey, filters);
  if (detail.files.length === 0) return detail;

  const scan = await scanHistory(repoId, filters, {
    dirs: false,
    authors: false,
    timeline: false,
  });
  const ownFiles = new Set(detail.files.map((f) => f.path));
  for (const [path, acc] of scan.files) {
    if (!ownFiles.has(path)) continue;
    const fileChurn = acc.added + acc.removed;
    const item = detail.files.find((f) => f.path === path)!;
    item.ownership = ratio(item.churn, fileChurn);
  }
  const totalsChurn = scan.totals.churn;
  detail.metrics.ownership = ratio(detail.metrics.churn, totalsChurn);
  return detail;
}

export interface DirectoryDetail {
  path: string;
  /** Full commit-set metrics of the same filter (|H| for η, etc.). */
  totals: CommitSetMetrics;
  /** Recursive sums for this directory (root: repository metrics). */
  metrics: Omit<DirectoryMetrics, "path"> | null;
  /** Files whose immediate parent is this directory. */
  files: FileMetrics[];
  /** Immediate subdirectories (recursive sums). */
  directories: DirectoryMetrics[];
}

/**
 * Directory detail: own recursive sums plus IMMEDIATE children (per the spec,
 * a directory's metrics are the sums over its immediate files and subdirs,
 * so children rows come straight from the accumulated maps).
 */
export async function getDirectoryDetail(
  repoId: string,
  dirPath: string,
  filters: MetricFilters = {},
): Promise<DirectoryDetail> {
  const scan = await scanHistory(repoId, filters);
  const own = scan.dirs.get(dirPath);
  const files: FileMetrics[] = [];
  for (const [path, acc] of scan.files) {
    if (parentDir(path) !== dirPath) continue;
    files.push({
      path,
      added: acc.added,
      removed: acc.removed,
      growth: acc.added - acc.removed,
      churn: acc.added + acc.removed,
      modifications: acc.modifications,
      commits: acc.commits,
      binaryCommits: acc.binaryCommits,
    });
  }
  const directories: DirectoryMetrics[] = [];
  for (const [path, acc] of scan.dirs) {
    if (path.length === 0 || parentDir(path) !== dirPath) continue;
    directories.push({
      path,
      added: acc.added,
      removed: acc.removed,
      growth: acc.added - acc.removed,
      churn: acc.added + acc.removed,
      modifications: acc.modifications,
      commits: acc.commits,
      fileCount: acc.files.size,
    });
  }
  files.sort(compareBy("churn", "desc"));
  directories.sort(compareBy("churn", "desc"));
  return {
    path: dirPath,
    totals: scan.totals,
    metrics: own
      ? {
          added: own.added,
          removed: own.removed,
          growth: own.added - own.removed,
          churn: own.added + own.removed,
          modifications: own.modifications,
          commits: own.commits,
          fileCount: own.files.size,
        }
      : null,
    files,
    directories,
  };
}

