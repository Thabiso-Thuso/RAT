import {
  getRepo,
  isValidRepoId,
  removeRepo,
} from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ repoId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json(
      { error: "Repository not found" },
      { status: 404 },
    );
  }
  const repo = await getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json(repo);
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { repoId } = await context.params;
  if (!isValidRepoId(repoId)) {
    return Response.json(
      { error: "Repository not found" },
      { status: 404 },
    );
  }
  const removed = await removeRepo(repoId);
  if (!removed) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
