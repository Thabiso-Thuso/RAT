import {
  isMailmapRule,
  normalizeMailmapRule,
  readMailmapLines,
  serializeMailmapRule,
  writeMailmapLines,
  type MailmapLine,
} from "@/lib/mailmap";
import { getRepo, isValidRepoId, repoDir } from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function taggedLines(lines: MailmapLine[]) {
  return lines.map((line, index) => ({
    index,
    kind: isMailmapRule(line) ? ("rule" as const) : ("comment" as const),
    line: line.line,
    rule: isMailmapRule(line)
      ? {
          canonicalName: line.canonicalName,
          canonicalEmail: line.canonicalEmail,
          rawName: line.rawName,
          rawEmail: line.rawEmail,
        }
      : null,
  }));
}

function repoOr404(repoId: string) {
  return isValidRepoId(repoId) ? getRepo(repoId) : Promise.resolve(null);
}

/** The repo's .mailmap as editable, position-tagged lines. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  const repo = await repoOr404(repoId);
  if (!repo || repo.status !== "ready") {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  const lines = await readMailmapLines(repoDir(repoId));
  return Response.json({ lines: taggedLines(lines) });
}

/** Add a merge rule (appends one line to .mailmap). */
export async function POST(
  request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  const repo = await repoOr404(repoId);
  if (!repo || repo.status !== "ready") {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const normalized = normalizeMailmapRule((body ?? {}) as Record<string, unknown>);
  if ("error" in normalized) {
    return Response.json({ error: normalized.error }, { status: 400 });
  }
  const line = serializeMailmapRule(normalized.rule);
  if (line === null) {
    return Response.json({ error: "Invalid merge rule" }, { status: 400 });
  }

  const lines = await readMailmapLines(repoDir(repoId));
  lines.push({ canonicalName: normalized.rule.canonicalName, canonicalEmail: normalized.rule.canonicalEmail, rawName: normalized.rule.rawName, rawEmail: normalized.rule.rawEmail, line });
  await writeMailmapLines(repoDir(repoId), lines);
  return Response.json({ ok: true, index: lines.length - 1, line });
}

/** Remove the rule at a line position (?index=N). */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ repoId: string }> },
) {
  const { repoId } = await context.params;
  const repo = await repoOr404(repoId);
  if (!repo || repo.status !== "ready") {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const index = Number.parseInt(
    new URL(request.url).searchParams.get("index") ?? "",
    10,
  );
  if (!Number.isInteger(index) || index < 0) {
    return Response.json(
      { error: "Provide the line position to delete as ?index=N." },
      { status: 400 },
    );
  }

  const lines = await readMailmapLines(repoDir(repoId));
  const target = lines[index];
  if (!target || !isMailmapRule(target)) {
    return Response.json(
      { error: "No merge rule at that position." },
      { status: 400 },
    );
  }
  lines.splice(index, 1);
  await writeMailmapLines(repoDir(repoId), lines);
  return Response.json({ ok: true, removed: target.line });
}
