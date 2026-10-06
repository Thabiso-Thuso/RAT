import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getRepositoryMetrics } from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { MetricsShell } from "@/components/metrics/shell";
import {
  Delta,
  MetricsGate,
  Pct,
  SummaryGrid,
  TimelineBars,
  fmt,
} from "@/components/metrics/ui";

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
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Commit-set metrics — H̄ (all non-merge commits from HEAD)
            </h2>
            <SummaryGrid totals={metrics.totals} />
          </section>

          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Monthly churn (committer time)
            </h2>
            <TimelineBars buckets={metrics.timeline} />
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Top files by churn λ
                <Link
                  href={`/repos/${repoId}/metrics/files`}
                  className="text-xs font-normal normal-case hover:underline"
                >
                  all files →
                </Link>
              </h2>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {metrics.topFiles.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-baseline justify-between gap-3 px-4 py-2"
                  >
                    <Link
                      href={`/repos/${repoId}/metrics/file?path=${encodeURIComponent(file.path)}`}
                      className="min-w-0 truncate font-mono text-xs hover:underline"
                      title={file.path}
                    >
                      {file.path}
                    </Link>
                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                      λ {fmt(file.churn)} · <Delta value={file.growth} />
                    </span>
                  </li>
                ))}
                {metrics.topFiles.length === 0 ? (
                  <li className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    No measured files.
                  </li>
                ) : null}
              </ul>
            </section>

            <section>
              <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Top authors by churn λ
                <Link
                  href={`/repos/${repoId}/metrics/authors`}
                  className="text-xs font-normal normal-case hover:underline"
                >
                  all authors →
                </Link>
              </h2>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
                {metrics.topAuthors.map((author) => (
                  <li
                    key={author.key}
                    className="flex items-baseline justify-between gap-3 px-4 py-2"
                  >
                    <Link
                      href={`/repos/${repoId}/metrics/author?key=${encodeURIComponent(author.key)}`}
                      className="min-w-0 truncate hover:underline"
                      title={author.key}
                    >
                      {author.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                      λ {fmt(author.churn)} · <Pct value={author.churn / Math.max(1, metrics.totals.churn)} />
                    </span>
                  </li>
                ))}
                {metrics.topAuthors.length === 0 ? (
                  <li className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                    No authors.
                  </li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>
      )}
    </MetricsShell>
  );
}
