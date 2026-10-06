import { listMergedAuthors } from "@/lib/history";
import { isValidRepoId } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Canonical authors of a repository: raw identities merged via the repo's
 * .mailmap, with summed commit counts, sorted by count desc.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  let authors;
  try {
    authors = await listMergedAuthors(repoId);
  } catch {
    return Response.json(
      { error: "No analyzed history available. Run analysis first." },
      { status: 404 },
    );
  }

  return Response.json({ authors });
}
