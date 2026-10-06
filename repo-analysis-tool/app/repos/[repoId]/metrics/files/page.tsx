import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getFileMetricsList, ratio } from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
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

/** File metrics for a filterable commit set: l+, l-, δ, λ, n, η. */
export default async function FilesMetricsPage({
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
  const action = `/repos/${repoId}/metrics/files`;

  const result =
    analysis.status === "ready"
      ? await getFileMetricsList(repoId, ctx.filters, ctx.list)
      : null;

  const th = "px-3 py-2 text-right font-medium first:px-4 last:pr-4";
  const td = "px-3 py-2 text-right tabular-nums first:px-4 last:pr-4";

  return (
    <MetricsShell repo={repo} active="files">
      {analysis.status !== "ready" || !result ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <div className="space-y-4">
          <FilterBar
            action={action}
            current={ctx.query}
            showSearch
            searchLabel="Path contains"
            searchPlaceholder="substring of the file path"
          />

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Per-file sums over the commit set (|H| ={" "}
            {fmt(result.totals.commitCount)} commits): η = n/|H|. Click a file
            for ownership per author.
          </p>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <SortHeader label="File" sortKey="path" action={action} current={ctx.query} />
                  <SortHeader label="l+" sortKey="added" action={action} current={ctx.query} />
                  <SortHeader label="l−" sortKey="removed" action={action} current={ctx.query} />
                  <SortHeader label="δ" sortKey="growth" action={action} current={ctx.query} />
                  <SortHeader label="λ" sortKey="churn" action={action} current={ctx.query} />
                  <SortHeader label="n" sortKey="modifications" action={action} current={ctx.query} />
                  <th className={`${th} text-left`}>η</th>
                  <SortHeader label="Touches" sortKey="commits" action={action} current={ctx.query} />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.items.map((file) => (
                  <tr
                    key={file.path}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="max-w-md px-4 py-2">
                      <Link
                        href={`/repos/${repoId}/metrics/file?path=${encodeURIComponent(file.path)}`}
                        className="block truncate font-mono text-xs hover:underline"
                        title={file.path}
                      >
                        {file.path}
                      </Link>
                    </td>
                    <td className={`${td} text-green-600 dark:text-green-400`}>
                      +{fmt(file.added)}
                    </td>
                    <td className={`${td} text-red-600 dark:text-red-400`}>
                      −{fmt(file.removed)}
                    </td>
                    <td className={td}>
                      <Delta value={file.growth} />
                    </td>
                    <td className={`${td} font-medium`}>{fmt(file.churn)}</td>
                    <td className={td}>{fmt(file.modifications)}</td>
                    <td className={td}>
                      <Pct value={ratio(file.modifications, result.totals.commitCount)} />
                    </td>
                    <td className={`${td} text-zinc-500 dark:text-zinc-400`}>
                      {fmt(file.commits)}
                      {file.binaryCommits > 0 ? (
                        <span
                          className="ml-1 text-[10px] text-zinc-400 dark:text-zinc-500"
                          title={`${file.binaryCommits} binary touch(es) — never measured`}
                        >
                          ({fmt(file.binaryCommits)} bin)
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No files match this commit set / filter.
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
