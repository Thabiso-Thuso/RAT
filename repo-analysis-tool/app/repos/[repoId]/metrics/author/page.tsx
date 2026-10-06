import Link from "next/link";

import { analysisOf } from "@/lib/history";
import {
  getAuthorDetailWithOwnership,
  ratio,
  type MetricFilters,
} from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { MetricsShell } from "@/components/metrics/shell";
import { filtersFromParams } from "@/lib/metrics";
import {
  Delta,
  FilterBar,
  MetricsGate,
  Pct,
  fmt,
} from "@/components/metrics/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Author detail: totals, per-file ownership ω(H,o,a), latest commits. */
export default async function AuthorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { repoId } = await params;
  const search = await searchParams;
  const repo = isValidRepoId(repoId) ? await getRepo(repoId) : null;
  const rawKey = (Array.isArray(search.key) ? search.key[0] : search.key) ?? "";

  if (!repo) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Repository not found.
        </p>
      </main>
    );
  }
  if (rawKey.length === 0) {
    return (
      <MetricsShell repo={repo} active="authors">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No author given.{" "}
          <Link href={`/repos/${repoId}/metrics/authors`} className="hover:underline">
            Browse authors →
          </Link>
        </p>
      </MetricsShell>
    );
  }

  const analysis = analysisOf(repo);
  const filters: MetricFilters = filtersFromParams(search);
  let detail = null;
  let unknown = false;
  if (analysis.status === "ready") {
    try {
      detail = await getAuthorDetailWithOwnership(repoId, rawKey, filters);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Unknown author")) {
        unknown = true;
      } else {
        throw error;
      }
    }
  }

  const query: Record<string, string | undefined> = { key: rawKey };
  if (filters.since !== undefined) query.since = String(filters.since);
  if (filters.until !== undefined) query.until = String(filters.until);

  const card = "rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900";
  const td = "px-3 py-2 text-right tabular-nums first:px-4 last:pr-4";

  return (
    <MetricsShell repo={repo} active="authors">
      {analysis.status !== "ready" ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : unknown || !detail ? (
        <div className="space-y-4">
          <FilterBar
            action={`/repos/${repoId}/metrics/author`}
            current={query}
            hidden={{ key: rawKey }}
          />
          <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <span className="block font-mono">{rawKey}</span>
            has no commits in the selected commit set.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-sm font-medium">{detail.name}</p>
            <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {detail.email} · key: {detail.key}
            </p>
          </div>

          <FilterBar
            action={`/repos/${repoId}/metrics/author`}
            current={query}
            showAuthor={false}
            hidden={{ key: rawKey }}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Commits
              </div>
              <div className="mt-1 font-semibold tabular-nums">{fmt(detail.metrics.commits)}</div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                l+ / l−
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                <span className="text-green-600 dark:text-green-400">+{fmt(detail.metrics.added)}</span>{" "}
                <span className="text-red-600 dark:text-red-400">−{fmt(detail.metrics.removed)}</span>
              </div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                δ / λ
              </div>
              <div className="mt-1 font-semibold tabular-nums">
                <Delta value={detail.metrics.growth} /> · {fmt(detail.metrics.churn)}
              </div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                n / η / ω
              </div>
              <div className="mt-1 text-sm font-semibold tabular-nums">
                {fmt(detail.metrics.modifications)} ·{" "}
                <Pct value={ratio(detail.metrics.modifications, detail.commitCount)} /> ·{" "}
                <Pct value={detail.metrics.ownership} />
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Files by churn — ownership ω(H,o,a) = λ(H,o,a)/λ(H,o)
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">File</th>
                    <th className="px-3 py-2 text-right font-medium">l+</th>
                    <th className="px-3 py-2 text-right font-medium">l−</th>
                    <th className="px-3 py-2 text-right font-medium">δ</th>
                    <th className="px-3 py-2 text-right font-medium">λ</th>
                    <th className="px-3 py-2 text-right font-medium">n</th>
                    <th className="px-3 py-2 text-right font-medium">ω</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {detail.files.map((file) => (
                    <tr key={file.path} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                      <td className="max-w-md px-4 py-2">
                        <Link
                          href={`/repos/${repoId}/metrics/file?path=${encodeURIComponent(file.path)}`}
                          className="block truncate font-mono text-xs hover:underline"
                          title={file.path}
                        >
                          {file.path}
                        </Link>
                      </td>
                      <td className={`${td} text-green-600 dark:text-green-400`}>+{fmt(file.added)}</td>
                      <td className={`${td} text-red-600 dark:text-red-400`}>−{fmt(file.removed)}</td>
                      <td className={td}>
                        <Delta value={file.growth} />
                      </td>
                      <td className={`${td} font-medium`}>{fmt(file.churn)}</td>
                      <td className={td}>{fmt(file.modifications)}</td>
                      <td className={td}>
                        <Pct value={file.ownership} />
                      </td>
                    </tr>
                  ))}
                  {detail.files.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No measured changes in this commit set.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Latest commits
            </h2>
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              {detail.commits.map((commit) => (
                <li key={commit.hash} className="flex flex-wrap items-baseline gap-x-3 px-4 py-2">
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {commit.hash.slice(0, 7)}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(commit.committerTs * 1000).toISOString().slice(0, 10)}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={commit.subject}>
                    {commit.subject}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums">
                    {commit.added === null || commit.removed === null ? (
                      <span className="text-zinc-400 dark:text-zinc-500">binary only</span>
                    ) : (
                      <>
                        <span className="text-green-600 dark:text-green-400">+{fmt(commit.added)}</span>{" "}
                        <span className="text-red-600 dark:text-red-400">−{fmt(commit.removed)}</span>
                      </>
                    )}
                  </span>
                </li>
              ))}
              {detail.commits.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No commits in this commit set.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      )}
    </MetricsShell>
  );
}
