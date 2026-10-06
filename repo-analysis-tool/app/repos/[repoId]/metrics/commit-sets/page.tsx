import { analysisOf } from "@/lib/history";
import { getRepositoryMetrics } from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { MetricsShell } from "@/components/metrics/shell";
import { pageContext } from "@/components/metrics/page-utils";
import {
  FilterBar,
  MetricsGate,
  SummaryGrid,
  TimelineBars,
} from "@/components/metrics/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Commit-set metrics: filter H by committer date (H(t): t ≤ date;
 * H(i,j): i ≤ date < j) and author, then compute the set sums: l+, l-,
 * δ, λ, n(H), η = n/|H|, ρ = λ/|H|.
 */
export default async function CommitSetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
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
  const ctx = pageContext(repoId, await searchParams);
  const analysis = analysisOf(repo);
  const action = `/repos/${repoId}/metrics/commit-sets`;

  const metrics =
    analysis.status === "ready"
      ? await getRepositoryMetrics(repoId, ctx.filters)
      : null;

  return (
    <MetricsShell repo={repo} active="commit-sets">
      {analysis.status !== "ready" || !metrics ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <div className="space-y-6">
          <p className="rounded-xl border border-zinc-200 bg-zinc-50/60 px-4 py-3 text-xs leading-relaxed text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
            Commit sets over non-merge commits, filtered by COMMITTER date:
            H(t) = &#123;h : t ≤ t(h)&#125; (set &ldquo;From&rdquo; empty and
            &ldquo;Until&rdquo; to t), H(i,j) = &#123;h : i ≤ t(h) &lt; j&#125;.
            The picked &ldquo;Until&rdquo; day is included. Metrics:
            n(H) = commits with λ &gt; 0, η = n/|H|, ρ = λ/|H| (0 when |H| = 0).
          </p>

          <FilterBar action={action} current={ctx.query} />

          <SummaryGrid totals={metrics.totals} />

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Monthly churn of the commit set
            </h2>
            <TimelineBars buckets={metrics.timeline} />
          </section>
        </div>
      )}
    </MetricsShell>
  );
}
