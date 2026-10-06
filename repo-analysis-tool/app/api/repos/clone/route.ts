import { mkdir } from "node:fs/promises";

import type { NextRequest } from "next/server";

import { validateCloneUrl, cloneRepo } from "@/lib/clone-repo";
import { analyzeIfReady } from "@/lib/history";
import { startJob } from "@/lib/jobs";
import {
  addRepo,
  ensureDataDirs,
  newRepoId,
  repoRoot,
  sanitizeRepoName,
} from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Expected a JSON body with a \"url\" field." },
      { status: 400 },
    );
  }

  const url =
    typeof body === "object" && body !== null && "url" in body
      ? (body as { url: unknown }).url
      : undefined;
  if (typeof url !== "string") {
    return Response.json(
      { error: "Missing \"url\" field." },
      { status: 400 },
    );
  }

  const trimmed = url.trim();
  const validation = validateCloneUrl(trimmed);
  if (!validation.ok) {
    return Response.json({ error: validation.reason }, { status: 400 });
  }

  await ensureDataDirs();
  const id = newRepoId();
  await addRepo({
    id,
    name: sanitizeRepoName(trimmed),
    source: "url",
    url: trimmed,
    status: "cloning",
    addedAt: new Date().toISOString(),
  });
  // simple-git creates the target directory during clone; ensure the parent
  // workspace exists first.
  await mkdir(repoRoot(id), { recursive: true });

  // Analyze automatically once the clone finishes successfully.
  startJob(id, async () => {
    await cloneRepo({ repoId: id, url: trimmed });
    await analyzeIfReady(id);
  });

  return Response.json({ id, status: "cloning" }, { status: 201 });
}
