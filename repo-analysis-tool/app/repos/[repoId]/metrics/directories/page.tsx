import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getDirectoryMetricsList, ratio } from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { MetricsLegend } from "@/components/metrics/legend";
import { MetricsShell } from "@/components/metrics/shell";
import { pageContext } from "@/components/metrics/page-utils";
import {
  Delta,
  FilterBar,
  MetricsGate,
  Pagination,
  Pct,
  SortHeader,
  fmt,
} from "@/components/metrics/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Directory metrics: recursive sums over immediate children (per spec).
 * The root directory is the repository metrics page, so it is not listed.
 */
export default async function DirectoriesMetricsPage({
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
  const action = `/repos/${repoId}/metrics/directories`;

  const result =
    analysis.status === "ready"
      ? await getDirectoryMetricsList(repoId, ctx.filters, ctx.list)
      : null;

  const td = "px-3 py-2 text-right tabular-nums first:px-4 last:pr-4";

  return (
    <MetricsShell repo={repo} active="directories">
      {analysis.status !== "ready" || !result ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <div className="space-y-4">
          <FilterBar
            action={action}
            current={ctx.query}
            showSearch
            searchLabel="Path contains"
            searchPlaceholder="substring of the directory path"
          />

          <MetricsLegend />

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            A directory&apos;s metrics are the sums over its immediate files
            and subdirectories (|H| = {fmt(result.totals.commitCount)} commits).
            Click a directory for its immediate children.
          </p>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <SortHeader label="Directory" sortKey="path" action={action} current={ctx.query} />
                  <th className="px-3 py-2 text-right font-medium">Files</th>
                  <SortHeader label="l+" sortKey="added" action={action} current={ctx.query} />
                  <SortHeader label="l−" sortKey="removed" action={action} current={ctx.query} />
                  <SortHeader label="δ" sortKey="growth" action={action} current={ctx.query} />
                  <SortHeader label="λ" sortKey="churn" action={action} current={ctx.query} />
                  <SortHeader label="n" sortKey="modifications" action={action} current={ctx.query} />
                  <th className="px-3 py-2 text-right font-medium">η</th>
                  <SortHeader label="Touches" sortKey="commits" action={action} current={ctx.query} />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.items.map((dir) => (
                  <tr
                    key={dir.path}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="max-w-md px-4 py-2">
                      <Link
                        href={`/repos/${repoId}/metrics/directory?path=${encodeURIComponent(dir.path)}`}
                        className="block truncate font-mono text-xs hover:underline"
                        title={dir.path}
                      >
                        {dir.path}/
                      </Link>
                    </td>
                    <td className={`${td} text-zinc-500 dark:text-zinc-400`}>
                      {fmt(dir.fileCount)}
                    </td>
                    <td className={`${td} text-green-600 dark:text-green-400`}>
                      +{fmt(dir.added)}
                    </td>
                    <td className={`${td} text-red-600 dark:text-red-400`}>
                      −{fmt(dir.removed)}
                    </td>
                    <td className={td}>
                      <Delta value={dir.growth} />
                    </td>
                    <td className={`${td} font-medium`}>{fmt(dir.churn)}</td>
                    <td className={td}>{fmt(dir.modifications)}</td>
                    <td className={td}>
                      <Pct value={ratio(dir.modifications, result.totals.commitCount)} />
                    </td>
                    <td className={`${td} text-zinc-500 dark:text-zinc-400`}>
                      {fmt(dir.commits)}
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No directories match this commit set / filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="border-t border-zinc-100 dark:border-zinc-800">
              <Pagination
                action={action}
                current={ctx.query}
                offset={result.offset}
                limit={result.limit}
                total={result.total}
              />
            </div>
          </div>
        </div>
      )}
    </MetricsShell>
  );
}
