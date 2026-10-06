import { promises as fs } from "node:fs";
import path from "node:path";

import extract from "extract-zip";

import { collectRepoMetadata, unsetCoreWorktree, type RepoMetadata } from "./git";
import { repoDir, repoRoot, updateRepo } from "./repo-store";

export interface IngestZipOptions {
  repoId: string;
  zipBuffer: Buffer;
}

/**
 * Ingest an uploaded zip in the background:
 *   workspace/upload.zip → workspace/extract/ → locate repo root →
 *   normalize .git → validate → workspace/repo/
 *
 * Always terminates in a terminal registry state ("ready" or "error");
 * scratch files are removed either way.
 */
export async function ingestZip({
  repoId,
  zipBuffer,
}: IngestZipOptions): Promise<void> {
  const workspace = repoRoot(repoId);
  const zipPath = path.join(workspace, "upload.zip");
  const extractDir = path.join(workspace, "extract");
  const finalDir = repoDir(repoId);

  try {
    await fs.mkdir(extractDir, { recursive: true });
    await fs.writeFile(zipPath, zipBuffer);

    // extract-zip is streamed and refuses entries that would escape the
    // target directory (zip-slip), so extraction itself is safe. Repo-root
    // detection below only walks the tree we just extracted via path.join,
    // so no untrusted path ever becomes a destination.
    await extract(zipPath, { dir: extractDir });

    const root = await locateRepoRoot(extractDir);
    if (!root) {
      throw new Error(
        "The zip does not contain a git repository (no .git found). " +
          "Zip the repository folder including its .git directory.",
      );
    }

    await normalizeGitDir(root, extractDir);

    let metadata: RepoMetadata;
    try {
      metadata = await collectRepoMetadata(root);
    } catch (error) {
      // Surface ingestion problems as clear status messages.
      throw new Error(
        error instanceof Error ? error.message : "Invalid git repository.",
      );
    }

    await unsetCoreWorktree(root);

    // Same filesystem (both under data/repos/<id>/), so rename is atomic.
    await fs.rename(root, finalDir);

    await updateRepo(repoId, {
      status: "ready",
      error: undefined,
      commitCount: metadata.commitCount,
      headHash: metadata.headHash,
      defaultBranch: metadata.defaultBranch ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateRepo(repoId, { status: "error", error: message });
  } finally {
    // Scratch extraction dir + zip. force: true tolerates the extraction
    // dir already having been renamed away on success.
    await fs.rm(extractDir, { recursive: true, force: true });
    await fs.rm(zipPath, { force: true });
  }
}

/**
 * Walk down while the zip nests everything in a single top-level folder.
 * Returns the innermost directory containing .git, or null.
 */
async function locateRepoRoot(dir: string): Promise<string | null> {
  let current = dir;
  for (;;) {
    if (await exists(path.join(current, ".git"))) return current;
    const entries = await fs.readdir(current, { withFileTypes: true });
    // macOS zips commonly carry a __MACOSX sidecar folder alongside the
    // payload; ignore it when checking for a single nested folder.
    const meaningful = entries.filter((entry) => entry.name !== "__MACOSX");
    if (meaningful.length === 1 && meaningful[0].isDirectory()) {
      current = path.join(current, meaningful[0].name);
      continue;
    }
    return null;
  }
}

/**
 * Accept either a real .git directory or a .git worktree pointer file
 * ("gitdir: <path>"). For pointers, copy the referenced git dir into the
 * repo root and drop the pointer so the folder is a normal working repo.
 */
async function normalizeGitDir(
  repoPath: string,
  extractDir: string,
): Promise<void> {
  const dotGit = path.join(repoPath, ".git");
  const stat = await fs.stat(dotGit);
  if (!stat.isFile()) return; // Real .git directory — nothing to do.

  const content = await fs.readFile(dotGit, "utf8");
  const match = /^gitdir:\s*(.+?)\s*$/m.exec(content);
  if (!match) {
    throw new Error(
      "The zip contains a .git pointer file without a usable gitdir reference.",
    );
  }

  const ref = match[1];
  // Candidate git dirs: the reference itself (relative refs resolve against
  // the checkout), plus the same basename at the extraction root for
  // absolute refs that were written on the original machine.
  const candidates = [path.resolve(repoPath, ref)];
  if (path.isAbsolute(ref)) {
    candidates.push(path.join(extractDir, path.basename(ref)));
  }

  let gitDir: string | null = null;
  for (const candidate of candidates) {
    if (await looksLikeGitDir(candidate)) {
      gitDir = candidate;
      break;
    }
  }
  if (!gitDir) {
    throw new Error(
      `The .git worktree pointer references "${ref}", whose git data is not inside the zip. ` +
        "Zip a checkout whose .git pointer target (a self-contained git directory) is included.",
    );
  }

  await fs.rm(dotGit);
  await fs.cp(gitDir, dotGit, { recursive: true });
  // Remove the original git dir if it lives inside our extraction.
  if (isInside(extractDir, gitDir)) {
    await fs.rm(gitDir, { recursive: true, force: true });
  }
}

/**
 * A usable, self-contained git dir needs HEAD and an object store. Bare
 * `git worktree` git dirs share objects with their main repo (only a
 * commondir link), so this check rejects those partial copies with a clear
 * error instead of producing a broken repository.
 */
async function looksLikeGitDir(dir: string): Promise<boolean> {
  return (
    (await exists(path.join(dir, "HEAD"))) &&
    (await exists(path.join(dir, "objects")))
  );
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}
