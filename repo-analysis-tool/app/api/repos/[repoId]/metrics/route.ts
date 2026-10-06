import type { NextRequest } from "next/server";

import {
  MetricsNotReadyError,
  filtersFromParams,
  getRepositoryMetrics,
} from "@/lib/metrics";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Repository-level metrics for a commit set (also serves commit-set queries).
 * Params: author (substring), since (inclusive), until (exclusive) —
 * unix seconds or "YYYY-MM-DD" dates.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const filters = filtersFromParams(Object.fromEntries(request.nextUrl.searchParams));
  try {
    const result = await getRepositoryMetrics(repoId, filters);
    return Response.json(result);
  } catch (error) {
    if (error instanceof MetricsNotReadyError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
