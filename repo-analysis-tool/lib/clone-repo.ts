import { promises as fs } from "node:fs";

import { simpleGit } from "simple-git";

import { collectRepoMetadata } from "./git";
import { repoDir, updateRepo } from "./repo-store";

const ALLOWED_SCHEMES = new Set(["http:", "https:", "ssh:", "git:", "file:"]);

export interface CloneOptions {
  repoId: string;
  url: string;
}

/**
 * Validate a clone URL. Accepts explicit http/https/ssh/git/file URLs plus
 * the scp-like ssh shorthand (git@host:path/repo.git).
 */
export function validateCloneUrl(
  url: string,
): { ok: true } | { ok: false; reason: string } {
  if (url.length === 0) {
    return { ok: false, reason: "URL is required." };
  }
  // scp-like ssh syntax: user@host:path (no scheme before the colon).
  if (/^[^/\\]+@[^:/\\]+:[^/\\]/.test(url)) {
    return { ok: true };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      ok: false,
      reason:
        "Invalid URL. Use http(s)://, ssh://, git:// or file:// — e.g. file:///absolute/path/to/repo.",
    };
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    return {
      ok: false,
      reason: `Unsupported URL scheme "${parsed.protocol.replace(
        ":",
        "",
      )}". Allowed: http, https, ssh, git, file.`,
    };
  }
  if (parsed.protocol === "file:" && parsed.hostname && parsed.hostname !== "localhost") {
    return { ok: false, reason: "file:// URLs must reference a local path." };
  }
  return { ok: true };
}

/**
 * Clone a repository in the background (full/deep clone — simple-git never
 * passes --depth) and finish in a terminal registry state.
 */
export async function cloneRepo({
  repoId,
  url,
}: CloneOptions): Promise<void> {
  const target = repoDir(repoId);
  try {
    await simpleGit().clone(url, target);
    const metadata = await collectRepoMetadata(target);
    await updateRepo(repoId, {
      status: "ready",
      error: undefined,
      commitCount: metadata.commitCount,
      headHash: metadata.headHash,
      defaultBranch: metadata.defaultBranch ?? undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Drop the partial clone so failed repos don't linger on disk.
    await fs.rm(target, { recursive: true, force: true });
    await updateRepo(repoId, { status: "error", error: message });
  }
}
