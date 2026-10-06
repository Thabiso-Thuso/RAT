import Link from "next/link";

import { analysisOf } from "@/lib/history";
import {
  getDirectoryDetail,
  ratio,
  type MetricFilters,
} from "@/lib/metrics";
import { getRepo, isValidRepoId } from "@/lib/repo-store";
import { MetricsLegend } from "@/components/metrics/legend";
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

/**
 * Directory detail: the directory's recursive sums plus its IMMEDIATE
 * children (files + subdirectories), matching the spec's directory metric
 * definition. The empty path is the repository root.
 */
export default async function DirectoryDetailPage({
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

  const analysis = analysisOf(repo);
  const filters: MetricFilters = filtersFromParams(search);
  const detail =
    analysis.status === "ready"
      ? await getDirectoryDetail(repoId, rawPath, filters)
      : null;

  const query: Record<string, string | undefined> = {};
  if (rawPath.length > 0) query.path = rawPath;
  if (filters.since !== undefined) query.since = String(filters.since);
  if (filters.until !== undefined) query.until = String(filters.until);

  const segments = rawPath.length > 0 ? rawPath.split("/") : [];

  const card = "rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900";
  const td = "px-3 py-2 text-right tabular-nums first:px-4 last:pr-4";

  return (
    <MetricsShell repo={repo} active="directories">
      {analysis.status !== "ready" || !detail ? (
        <MetricsGate status={analysis.status} error={analysis.error} />
      ) : (
        <div className="space-y-6">
          <div>
            <p className="break-all font-mono text-sm font-medium">
              <Link
                href={buildDirHref(repoId, "", query)}
                className="hover:underline"
              >
                (root)
              </Link>
              {segments.map((segment, index) => (
                <span key={index}>
                  /
                  <Link
                    href={buildDirHref(repoId, segments.slice(0, index + 1).join("/"), query)}
                    className="hover:underline"
                  >
                    {segment}
                  </Link>
                </span>
              ))}
              {rawPath.length > 0 ? "/" : ""}
            </p>
          </div>

          <FilterBar
            action={`/repos/${repoId}/metrics/directory`}
            current={query}
            hidden={query}
          />

          <MetricsLegend />

          {detail.metrics ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className={card}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">l+ / l−</div>
                <div className="mt-1 font-semibold tabular-nums">
                  <span className="text-green-600 dark:text-green-400">+{fmt(detail.metrics.added)}</span>{" "}
                  <span className="text-red-600 dark:text-red-400">−{fmt(detail.metrics.removed)}</span>
                </div>
              </div>
              <div className={card}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">δ = l+ − l−</div>
                <div className="mt-1 font-semibold">
                  <Delta value={detail.metrics.growth} />
                </div>
              </div>
              <div className={card}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">λ = l+ + l−</div>
                <div className="mt-1 font-semibold tabular-nums">{fmt(detail.metrics.churn)}</div>
              </div>
              <div className={card}>
                <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">n / η · files</div>
                <div className="mt-1 text-sm font-semibold tabular-nums">
                  {fmt(detail.metrics.modifications)} ·{" "}
                  <Pct value={ratio(detail.metrics.modifications, detail.totals.commitCount)} /> ·{" "}
                  {fmt(detail.metrics.fileCount)}
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No measured changes under this directory in the current commit set.
            </p>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Immediate subdirectories
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-2 font-medium">Directory</th>
                    <th className="px-3 py-2 text-right font-medium">Files</th>
                    <th className="px-3 py-2 text-right font-medium">l+</th>
                    <th className="px-3 py-2 text-right font-medium">l−</th>
                    <th className="px-3 py-2 text-right font-medium">δ</th>
                    <th className="px-3 py-2 text-right font-medium">λ</th>
                    <th className="px-3 py-2 text-right font-medium">n</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {detail.directories.map((dir) => (
                    <tr key={dir.path} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40">
                      <td className="max-w-md px-4 py-2">
                        <Link
                          href={buildDirHref(repoId, dir.path, query)}
                          className="block truncate font-mono text-xs hover:underline"
                          title={dir.path}
                        >
                          {dir.path}/
                        </Link>
                      </td>
                      <td className={`${td} text-zinc-500 dark:text-zinc-400`}>{fmt(dir.fileCount)}</td>
                      <td className={`${td} text-green-600 dark:text-green-400`}>+{fmt(dir.added)}</td>
                      <td className={`${td} text-red-600 dark:text-red-400`}>−{fmt(dir.removed)}</td>
                      <td className={td}>
                        <Delta value={dir.growth} />
                      </td>
                      <td className={`${td} font-medium`}>{fmt(dir.churn)}</td>
                      <td className={td}>{fmt(dir.modifications)}</td>
                    </tr>
                  ))}
                  {detail.directories.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No subdirectories with changes in this commit set.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Immediate files
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
                    </tr>
                  ))}
                  {detail.files.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No files directly in this directory with changes.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </MetricsShell>
  );
}

function buildDirHref(
  repoId: string,
  dirPath: string,
  query: Record<string, string | undefined>,
): string {
  const search = new URLSearchParams();
  if (dirPath.length > 0) search.set("path", dirPath);
  for (const key of ["since", "until"] as const) {
    const value = query[key];
    if (value !== undefined) search.set(key, value);
  }
  const qs = search.toString();
  return `/repos/${repoId}/metrics/directory${qs.length > 0 ? `?${qs}` : ""}`;
}
