import { startAnalysis } from "@/lib/history";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kick off (or re-run) history analysis for a repository. */
export async function POST(
  _request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const result = await startAnalysis(repoId);
  switch (result) {
    case "started":
      return Response.json(
        { analysis: { status: "analyzing" } },
        { status: 202 },
      );
    case "already-running":
      return Response.json(
        { error: "Analysis is already in progress." },
        { status: 409 },
      );
    case "not-ready":
      return Response.json(
        { error: "Repository is not ready for analysis." },
        { status: 409 },
      );
    case "unknown":
      return Response.json({ error: "Repository not found" }, { status: 404 });
  }
}
