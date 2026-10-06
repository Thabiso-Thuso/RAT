import { analysisOf } from "@/lib/history";
import { getRepositoryMetrics } from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { OverviewBody } from "@/components/metrics/overview-body";
import { MetricsGate } from "@/components/metrics/ui";
import { MetricsShell } from "@/components/metrics/shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Repository metrics: the root directory over the full commit set H̄. */
export default async function RepositoryMetricsPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;
  const repo = isValidRepoId(repoId) ? await getRepo(repoId) : null;
  if (!repo) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Repository not found.
        </p>
      </main>
    );
  }
  const analysis = analysisOf(repo);
  const metrics =
    analysis.status === "ready" ? await getRepositoryMetrics(repoId) : null;

  return (
    <MetricsShell repo={repo} active="overview">
      {analysis.status !== "ready" || !metrics ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <OverviewBody repoId={repoId} metrics={metrics} />
      )}
    </MetricsShell>
  );
}
