import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { RepoEntry, RepoRegistry } from "./types";

/**
 * Filesystem-backed registry for ingested repositories.
 *
 * Layout:
 *   data/repos/<repoId>/repo/      the extracted or cloned git repository
 *   data/repos/<repoId>/...        scratch space (upload.zip, extract/) removed on success
 *   data/repos/index.json          the registry
 */

const DATA_DIR = path.join(process.cwd(), "data");
const REPOS_DIR = path.join(DATA_DIR, "repos");
const INDEX_FILE = path.join(REPOS_DIR, "index.json");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMPTY_REGISTRY: RepoRegistry = { version: 1, repos: [] };

// All index.json mutations are serialized through this queue so concurrent
// route handlers (polls + background jobs) cannot clobber each other.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

async function readRegistry(): Promise<RepoRegistry> {
  try {
    const raw = await fs.readFile(INDEX_FILE, "utf8");
    const parsed = JSON.parse(raw) as RepoRegistry;
    if (!Array.isArray(parsed.repos)) return { ...EMPTY_REGISTRY };
    return parsed;
  } catch {
    return { ...EMPTY_REGISTRY };
  }
}

async function writeRegistry(registry: RepoRegistry): Promise<void> {
  await fs.mkdir(REPOS_DIR, { recursive: true });
  // Atomic replace so a crash mid-write never corrupts the registry.
  const tmp = `${INDEX_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(registry, null, 2)}\n`);
  await fs.rename(tmp, INDEX_FILE);
}

export function newRepoId(): string {
  return randomUUID();
}

export function isValidRepoId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Directory holding everything for one repo (the repo/, scratch files). */
export function repoRoot(id: string): string {
  return path.join(REPOS_DIR, id);
}

/** Directory containing the actual git repository. */
export function repoDir(id: string): string {
  return path.join(repoRoot(id), "repo");
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(REPOS_DIR, { recursive: true });
}

export async function listRepos(): Promise<RepoEntry[]> {
  const { repos } = await readRegistry();
  // Newest first.
  return [...repos].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
}

export async function getRepo(id: string): Promise<RepoEntry | null> {
  const { repos } = await readRegistry();
  return repos.find((repo) => repo.id === id) ?? null;
}

export async function addRepo(entry: RepoEntry): Promise<void> {
  await enqueue(async () => {
    const registry = await readRegistry();
    if (registry.repos.some((repo) => repo.id === entry.id)) {
      throw new Error(`Repository ${entry.id} already exists`);
    }
    registry.repos.push(entry);
    await writeRegistry(registry);
  });
}

/** Patch an entry; silently does nothing if the repo was deleted meanwhile. */
export async function updateRepo(
  id: string,
  patch: Partial<Omit<RepoEntry, "id">>,
): Promise<RepoEntry | null> {
  return enqueue(async () => {
    const registry = await readRegistry();
    const repo = registry.repos.find((entry) => entry.id === id);
    if (!repo) return null;
    Object.assign(repo, patch);
    await writeRegistry(registry);
    return repo;
  });
}

/** Remove the on-disk workspace and the registry entry. Returns false if unknown. */
export async function removeRepo(id: string): Promise<boolean> {
  await fs.rm(repoRoot(id), { recursive: true, force: true });
  return enqueue(async () => {
    const registry = await readRegistry();
    const before = registry.repos.length;
    registry.repos = registry.repos.filter((repo) => repo.id !== id);
    if (registry.repos.length === before) return false;
    await writeRegistry(registry);
    return true;
  });
}

/**
 * Sanitize a user/zip/URL-derived name into a display-safe repo name.
 */
export function sanitizeRepoName(raw: string): string {
  const cleaned = raw
    .replace(/\.zip$/i, "")
    .replace(/\.git$/i, "")
    .split(/[\\/]/)
    .pop() ?? "";
  const name = cleaned
    .replace(/[^\w .-]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return name.length > 0 ? name : "repository";
}
