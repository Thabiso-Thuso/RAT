import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getFileDetail, ratio, type MetricFilters } from "@/lib/metrics";
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

/** Single-file detail: metrics, per-author ownership ω, latest touches. */
export default async function FileDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { repoId } = await params;
  const search = await searchParams;
  const repo = isValidRepoId(repoId) ? await getRepo(repoId) : null;
  const rawPath = (Array.isArray(search.path) ? search.path[0] : search.path) ?? "";

  if (!repo) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Repository not found.
        </p>
      </main>
    );
  }
  if (rawPath.length === 0) {
    return (
      <MetricsShell repo={repo} active="files">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No file path given.{" "}
          <Link href={`/repos/${repoId}/metrics/files`} className="hover:underline">
            Browse files →
          </Link>
        </p>
      </MetricsShell>
    );
  }

  const analysis = analysisOf(repo);
  const filters: MetricFilters = filtersFromParams(search);
  const detail =
    analysis.status === "ready"
      ? await getFileDetail(repoId, rawPath, filters)
      : null;

  const query: Record<string, string | undefined> = { path: rawPath };
  if (filters.since !== undefined) query.since = String(filters.since);
  if (filters.until !== undefined) query.until = String(filters.until);

  const card = "rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900";

  return (
    <MetricsShell repo={repo} active="files">
      {analysis.status !== "ready" || !detail ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : !detail.exists ? (
        <div className="space-y-4">
          <FilterBar
            action={`/repos/${repoId}/metrics/file`}
            current={query}
            hidden={{ path: rawPath }}
          />
          <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            <span className="block truncate font-mono" title={rawPath}>
              {rawPath}
            </span>
            does not appear in the analyzed history for this commit set.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <p className="break-all font-mono text-sm font-medium">{rawPath}</p>
            {detail.renamedTo.length > 0 ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Renamed away to:{" "}
                {detail.renamedTo.map((target, index) => (
                  <span key={target}>
                    {index > 0 ? ", " : ""}
                    <Link
                      href={`/repos/${repoId}/metrics/file?path=${encodeURIComponent(target)}`}
                      className="font-mono hover:underline"
                    >
                      {target}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>

          <FilterBar
            action={`/repos/${repoId}/metrics/file`}
            current={query}
            hidden={{ path: rawPath }}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">l+ / l−</div>
              <div className="mt-1 font-semibold tabular-nums">
                <span className="text-green-600 dark:text-green-400">+{fmt(detail.metrics?.added ?? 0)}</span>{" "}
                <span className="text-red-600 dark:text-red-400">−{fmt(detail.metrics?.removed ?? 0)}</span>
              </div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">δ = l+ − l−</div>
              <div className="mt-1 font-semibold">
                <Delta value={detail.metrics?.growth ?? 0} />
              </div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">λ = l+ + l−</div>
              <div className="mt-1 font-semibold tabular-nums">{fmt(detail.metrics?.churn ?? 0)}</div>
            </div>
            <div className={card}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">n / η / ρ</div>
              <div className="mt-1 text-sm font-semibold tabular-nums">
                {fmt(detail.metrics?.modifications ?? 0)} ·{" "}
                <Pct value={ratio(detail.metrics?.modifications ?? 0, detail.commitCount)} /> ·{" "}
                <Pct value={ratio(detail.metrics?.churn ?? 0, detail.commitCount)} />
              </div>
            </div>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Ownership by author (ω = λ(H,o,a)/λ(H,o))
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Author</th>
                    <th className="px-3 py-2 text-right font-medium">l+</th>
                    <th className="px-3 py-2 text-right font-medium">l−</th>
                    <th className="px-3 py-2 text-right font-medium">λ</th>
                    <th className="px-3 py-2 text-right font-medium">n</th>
                    <th className="px-3 py-2 text-right font-medium">ω</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {detail.authors.map((author) => (
                    <tr key={author.key}>
                      <td className="max-w-xs px-4 py-2">
                        <Link
                          href={`/repos/${repoId}/metrics/author?key=${encodeURIComponent(author.key)}`}
                          className="block truncate hover:underline"
                          title={author.key}
                        >
                          {author.name}
                        </Link>
                        <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {author.email}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-green-600 dark:text-green-400">
                        +{fmt(author.added)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400">
                        −{fmt(author.removed)}
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {fmt(author.churn)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmt(author.modifications)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <Pct value={author.ownership} />
                      </td>
                    </tr>
                  ))}
                  {detail.authors.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No measured (non-binary) changes in this commit set.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Latest touches
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
                      <span className="text-zinc-400 dark:text-zinc-500">binary</span>
                    ) : (
                      <>
                        <span className="text-green-600 dark:text-green-400">+{fmt(commit.added)}</span>{" "}
                        <span className="text-red-600 dark:text-red-400">−{fmt(commit.removed)}</span>
                      </>
                    )}
                  </span>
                  {commit.prevPath ? (
                    <span
                      className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400"
                      title={`Rename detected; metrics attributed to this path (from ${commit.prevPath})`}
                    >
                      renamed from {commit.prevPath}
                    </span>
                  ) : null}
                </li>
              ))}
              {detail.commits.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No commits touch this file in this commit set.
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      )}
    </MetricsShell>
  );
}
