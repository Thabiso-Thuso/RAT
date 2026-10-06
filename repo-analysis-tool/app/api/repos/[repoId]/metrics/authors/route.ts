import type { NextRequest } from "next/server";

import {
  MetricsNotReadyError,
  filtersFromParams,
  getAuthorMetricsList,
  listOptionsFromParams,
} from "@/lib/metrics";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-author metrics (post-mailmap canonical identities) for a commit set.
 * Params: author, since, until + search (name/email substring), sort, order,
 * offset, limit.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const search = Object.fromEntries(request.nextUrl.searchParams);
  try {
    const result = await getAuthorMetricsList(
      repoId,
      filtersFromParams(search),
      listOptionsFromParams(search),
    );
    return Response.json(result);
  } catch (error) {
    if (error instanceof MetricsNotReadyError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
