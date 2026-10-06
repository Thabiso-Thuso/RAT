import { simpleGit } from "simple-git";

export interface RepoMetadata {
  headHash: string;
  commitCount: number;
  defaultBranch: string | null;
}

/**
 * Validate a directory as a usable git repository and collect headline
 * metadata. `rev-list --count --no-merges HEAD` fails both for
 * non-repositories and for repositories with zero commits, so this doubles
 * as ingestion validation. The count follows the metrics spec: non-merge
 * commits reachable from HEAD (H̄).
 */
export async function collectRepoMetadata(
  repoPath: string,
): Promise<RepoMetadata> {
  const git = simpleGit(repoPath);
  try {
    const [headHash, commitCount] = await Promise.all([
      git.revparse("HEAD"),
      git.raw(["rev-list", "--count", "--no-merges", "HEAD"]),
    ]);
    let defaultBranch: string | null = null;
    try {
      defaultBranch =
        (await git.raw(["symbolic-ref", "--short", "HEAD"])).trim() || null;
    } catch {
      // Detached HEAD (common for zipped checkouts) — leave null.
    }
    return {
      headHash: headHash.trim(),
      commitCount: Number.parseInt(commitCount.trim(), 10),
      defaultBranch,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not a git repository/i.test(message)) {
      throw new Error("The directory is not a git repository (no .git found).");
    }
    if (/does not have any commits yet|bad revision/i.test(message)) {
      throw new Error(
        "The git repository has no commits yet (empty history).",
      );
    }
    throw error;
  }
}

/**
 * Best-effort cleanup for worktree checkouts: after the real git dir has been
 * moved into the repo, `core.worktree` would still point at the original
 * machine's checkout, so drop it.
 */
export async function unsetCoreWorktree(repoPath: string): Promise<void> {
  try {
    await simpleGit(repoPath).raw(["config", "--unset", "core.worktree"]);
  } catch {
    // Not set (or already unset) — nothing to do.
  }
}
