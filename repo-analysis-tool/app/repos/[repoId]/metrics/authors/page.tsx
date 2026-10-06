import Link from "next/link";

import { analysisOf } from "@/lib/history";
import { getAuthorMetricsList, ratio } from "@/lib/metrics";
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

/** Author metrics over a commit set; identities are canonical (post-mailmap). */
export default async function AuthorsMetricsPage({
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
  const action = `/repos/${repoId}/metrics/authors`;

  const result =
    analysis.status === "ready"
      ? await getAuthorMetricsList(repoId, ctx.filters, ctx.list)
      : null;

  const td = "px-3 py-2 text-right tabular-nums first:px-4 last:pr-4";

  return (
    <MetricsShell repo={repo} active="authors">
      {analysis.status !== "ready" || !result ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <div className="space-y-4">
          <FilterBar
            action={action}
            current={ctx.query}
            showAuthor={false}
            showSearch
            searchLabel="Filter authors"
            searchPlaceholder="name or email contains"
          />

          <MetricsLegend />

          <p className="text-xs">
            <Link
              href={`/repos/${repoId}/authors`}
              className="font-medium text-zinc-600 hover:underline dark:text-zinc-300"
            >
              Manage merging (author identities) →
            </Link>
          </p>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Canonical authors (after .mailmap merging) of the commit set
            (|H| = {fmt(result.totals.commitCount)} commits): n = commits with
            λ &gt; 0, η = n/|H|, ω = λ(author)/λ(total).
          </p>

          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <SortHeader label="Author" sortKey="path" action={action} current={ctx.query} />
                  <SortHeader label="Commits" sortKey="commits" action={action} current={ctx.query} />
                  <SortHeader label="l+" sortKey="added" action={action} current={ctx.query} />
                  <SortHeader label="l−" sortKey="removed" action={action} current={ctx.query} />
                  <SortHeader label="δ" sortKey="growth" action={action} current={ctx.query} />
                  <SortHeader label="λ" sortKey="churn" action={action} current={ctx.query} />
                  <SortHeader label="n" sortKey="modifications" action={action} current={ctx.query} />
                  <th className="px-3 py-2 text-right font-medium">η</th>
                  <th className="px-3 py-2 text-right font-medium">ω</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {result.items.map((author) => (
                  <tr
                    key={author.key}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="max-w-xs px-4 py-2">
                      <Link
                        href={`/repos/${repoId}/metrics/author?key=${encodeURIComponent(author.key)}`}
                        className="block truncate font-medium hover:underline"
                        title={author.key}
                      >
                        {author.name}
                      </Link>
                      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {author.email}
                      </span>
                    </td>
                    <td className={td}>{fmt(author.commits)}</td>
                    <td className={`${td} text-green-600 dark:text-green-400`}>
                      +{fmt(author.added)}
                    </td>
                    <td className={`${td} text-red-600 dark:text-red-400`}>
                      −{fmt(author.removed)}
                    </td>
                    <td className={td}>
                      <Delta value={author.growth} />
                    </td>
                    <td className={`${td} font-medium`}>{fmt(author.churn)}</td>
                    <td className={td}>{fmt(author.modifications)}</td>
                    <td className={td}>
                      <Pct value={ratio(author.modifications, result.totals.commitCount)} />
                    </td>
                    <td className={td}>
                      <Pct value={ratio(author.churn, result.totals.churn)} />
                    </td>
                  </tr>
                ))}
                {result.items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                      No authors match this commit set / filter.
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
