import type { NextRequest } from "next/server";

import { isValidRepoId } from "@/lib/repo-store";
import { queryCommits } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseTimestamp(raw: string | null): number | undefined {
  if (raw === null || raw.length === 0) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Query the analyzed history of a repository.
 * Params: offset, limit (1-500), since (inclusive ts), until (exclusive ts),
 * author (substring, case-insensitive, matched against the canonical
 * mailmap-resolved identity or the raw identity), path (substring).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const offset = Math.max(0, parseTimestamp(params.get("offset")) ?? 0);
  let result;
  try {
    result = await queryCommits(repoId, {
      since: parseTimestamp(params.get("since")),
      until: parseTimestamp(params.get("until")),
      author: params.get("author") ?? undefined,
      path: params.get("path") ?? undefined,
      offset,
      limit: parseTimestamp(params.get("limit")),
    });
  } catch {
    return Response.json(
      { error: "No analyzed history available. Run analysis first." },
      { status: 404 },
    );
  }

  return Response.json({
    total: result.total,
    offset,
    commits: result.commits,
  });
}
