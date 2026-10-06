import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getRepositoryMetrics } from "@/lib/metrics";
import { getRepo, isValidRepoId, listRepos } from "@/lib/repo-store";
import { OverviewBody } from "@/components/metrics/overview-body";
import { MetricsGate } from "@/components/metrics/ui";
import { MetricsShell } from "@/components/metrics/shell";
import type { RepoEntry } from "@/lib/types";

export const runtime = "nodejs";

// Registry + metrics come from the filesystem; always render fresh.
export const dynamic = "force-dynamic";

function pickDefaultRepo(repos: RepoEntry[]): RepoEntry | null {
  return (
    repos.find(
      (repo) => repo.status === "ready" && analysisOf(repo).status === "ready",
    ) ??
    repos.find((repo) => repo.status === "ready") ??
    null
  );
}

/**
 * Dashboard: shows the metrics of the selected repository. `?repo=<id>`
 * selects explicitly; otherwise the most recently analyzed repository is
 * shown so the landing page always has content once any history exists.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { repo: repoParam } = await searchParams;
  const repos = await listRepos();

  let repo: RepoEntry | null = null;
  let defaulted = false;
  if (typeof repoParam === "string" && isValidRepoId(repoParam)) {
    repo = await getRepo(repoParam);
  }
  if (!repo) {
    repo = pickDefaultRepo(repos);
    defaulted = repo !== null;
  }

  if (!repo) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center dark:border-zinc-700">
          <h1 className="text-lg font-semibold tracking-tight">
            {repos.length === 0
              ? "Welcome to RAT"
              : "Nothing analyzed yet"}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
            {repos.length === 0
              ? "Add a git repository by zip upload or URL clone, let the history analysis finish, and its metrics will appear here."
              : "Metrics become available once a repository's history analysis completes. Check the status of your repositories on the management page."}
          </p>
          <Link
            href="/repositories"
            className="mt-6 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Manage repositories
          </Link>
        </div>
      </main>
    );
  }

  const analysis = analysisOf(repo);
  const metrics =
    analysis.status === "ready" ? await getRepositoryMetrics(repo.id) : null;

  return (
    <MetricsShell repo={repo} active="overview">
      {defaulted ? (
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Showing the most recently analyzed repository — pick another from the
          sidebar.
        </p>
      ) : null}
      {analysis.status !== "ready" || !metrics ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <OverviewBody repoId={repo.id} metrics={metrics} />
      )}
    </MetricsShell>
  );
}
