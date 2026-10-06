// Shared repository registry types. Safe to import from client components
// (type-only, no Node.js APIs).

export type RepoSource = "zip" | "url";

export type RepoStatus = "extracting" | "cloning" | "ready" | "error";

export interface RepoEntry {
  id: string;
  name: string;
  source: RepoSource;
  /** Remote URL, set only when source === "url". */
  url?: string;
  status: RepoStatus;
  /** Failure reason, set only when status === "error". */
  error?: string;
  /** ISO 8601 timestamp of when the repo was added. */
  addedAt: string;
  /** Populated once status === "ready". */
  commitCount?: number;
  headHash?: string;
  defaultBranch?: string;
  /** Git history ingestion state; missing = "unanalyzed" (pre-Feature-2 entries). */
  analysis?: AnalysisInfo;
}

export interface RepoRegistry {
  version: 1;
  repos: RepoEntry[];
}

// ---------------------------------------------------------------------------
// History ingestion (Feature 2)
// ---------------------------------------------------------------------------

export type AnalysisStatus = "unanalyzed" | "analyzing" | "ready" | "error";

export interface AnalysisInfo {
  status: AnalysisStatus;
  /** Failure reason, set only when status === "error". */
  error?: string;
  /** ISO 8601 timestamp of the last successful analysis. */
  analyzedAt?: string;
  /** Number of non-merge commits stored in history. */
  commitCount?: number;
}

/** One changed path in a commit's numstat. */
export interface CommitFileStat {
  path: string;
  /** Lines added; null = binary file (git's own detection, not measured). */
  added: number | null;
  /** Lines removed; null = binary file. */
  removed: number | null;
  /** Rename source when git detected a rename; metrics are attributed to
   *  `path` (the new path) per the metrics spec. */
  prevPath?: string;
}

/** A non-merge commit with its raw (pre-mailmap) author identity. */
export interface HistoryCommit {
  hash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  /** Unix seconds of the COMMITTER date (drives commit-set filtering). */
  committerTs: number;
  subject: string;
  stats: CommitFileStat[];
}

/** history.json — analysis summary written alongside history.jsonl. */
export interface HistoryMeta {
  version: 1;
  repoId: string;
  analyzedAt: string;
  headHash: string;
  commitCount: number;
  /** Committer-time range of the stored history (unix seconds). */
  firstCommitterTs: number | null;
  lastCommitterTs: number | null;
  /** Raw authors (pre-merging) with commit counts, sorted by count desc. */
  authors: { name: string; email: string; commits: number }[];
}

// ---------------------------------------------------------------------------
// Author merging (mailmap, resolved at query time)
// ---------------------------------------------------------------------------

/** An author identity after mailmap resolution; equals the raw identity when
 *  no mapping applies. */
export interface CanonicalAuthor {
  name: string;
  email: string;
}

/** A commit as served by the commits query API: the stored raw identity plus
 *  the mailmap-resolved canonical author. */
export interface CommitListItem extends HistoryCommit {
  canonicalAuthor: CanonicalAuthor;
}

/** A canonical author with the commit count summed over every raw identity
 *  the mailmap merges onto it. */
export interface MergedAuthor extends CanonicalAuthor {
  commits: number;
}
