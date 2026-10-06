import type { NextRequest } from "next/server";

import {
  MetricsNotReadyError,
  filtersFromParams,
  getAuthorDetailWithOwnership,
} from "@/lib/metrics";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detail for one canonical author: totals, per-file ownership, latest commits. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const key = request.nextUrl.searchParams.get("key");
  if (!key || key.length === 0) {
    return Response.json(
      { error: "Missing required param: key (canonical \"name <email>\")" },
      { status: 400 },
    );
  }
  const filters = filtersFromParams(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  try {
    const detail = await getAuthorDetailWithOwnership(repoId, key, filters);
    return Response.json(detail);
  } catch (error) {
    if (error instanceof MetricsNotReadyError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.startsWith("Unknown author")) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
