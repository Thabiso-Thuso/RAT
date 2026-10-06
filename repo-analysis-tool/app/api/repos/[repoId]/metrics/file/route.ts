import type { NextRequest } from "next/server";

import {
  MetricsNotReadyError,
  filtersFromParams,
  getFileDetail,
} from "@/lib/metrics";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Detail for one file: metrics, per-author ownership, latest touches. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.length === 0) {
    return Response.json({ error: "Missing required param: path" }, { status: 400 });
  }
  const filters = filtersFromParams(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  try {
    const detail = await getFileDetail(repoId, path, filters);
    if (!detail.exists) {
      return Response.json(
        { error: `File not found in analyzed history: ${path}` },
        { status: 404 },
      );
    }
    return Response.json(detail);
  } catch (error) {
    if (error instanceof MetricsNotReadyError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
