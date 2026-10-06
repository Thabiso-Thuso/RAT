import { promises as fs } from "node:fs";

import type { NextRequest } from "next/server";

import { ingestZip } from "@/lib/ingest-zip";
import { analyzeIfReady } from "@/lib/history";
import { startJob } from "@/lib/jobs";
import {
  addRepo,
  ensureDataDirs,
  listRepos,
  newRepoId,
  repoRoot,
  sanitizeRepoName,
} from "@/lib/repo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ~300 MB upload ceiling.
const MAX_ZIP_BYTES = 300 * 1024 * 1024;

export async function GET() {
  const repos = await listRepos();
  return Response.json({ repos });
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Missing \"file\" field with a .zip archive." },
      { status: 400 },
    );
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return Response.json(
      { error: "Only .zip archives are supported." },
      { status: 400 },
    );
  }
  if (file.size > MAX_ZIP_BYTES) {
    return Response.json(
      { error: "The zip exceeds the 300 MB upload limit." },
      { status: 413 },
    );
  }

  await ensureDataDirs();
  const id = newRepoId();
  await addRepo({
    id,
    name: sanitizeRepoName(file.name),
    source: "zip",
    status: "extracting",
    addedAt: new Date().toISOString(),
  });
  await fs.mkdir(repoRoot(id), { recursive: true });

  const zipBuffer = Buffer.from(await file.arrayBuffer());
  // Analyze automatically once the zip ingests successfully.
  startJob(id, async () => {
    await ingestZip({ repoId: id, zipBuffer });
    await analyzeIfReady(id);
  });

  return Response.json({ id, status: "extracting" }, { status: 201 });
}
