import Link from "next/link";
import type { ReactNode } from "react";

import { analysisOf } from "@/lib/history";
import {
  getRepositoryMetrics,
  type RepositoryMetrics,
} from "@/lib/metrics";
import { isValidRepoId, listRepos } from "@/lib/repo-store";
import {
  CompareTimelineChart,
  type CompareSeries,
} from "@/components/compare/timeline-chart";
import { Delta, Pct, TimelineBars, fmt } from "@/components/metrics/ui";
import type { RepoEntry } from "@/lib/types";

export const runtime = "nodejs";

// Metrics come from the filesystem; always render fresh.
export const dynamic = "force-dynamic";

const MAX_COMPARE = 6;
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#0891b2",
];

interface CompareColumn {
  entry: RepoEntry;
  color: string;
  metrics: RepositoryMetrics | null;
  skipReason: string | null;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function metricRows(): {
  label: string;
  title?: string;
  render: (metrics: RepositoryMetrics) => ReactNode;
}[] {
  return [
    {
      label: "Commits |H|",
      title: "Non-merge commits in the commit set",
      render: (m) => fmt(m.totals.commitCount),
    },
    {
      label: "Modifications n",
      title: "Commits with λ > 0",
      render: (m) => fmt(m.totals.modifications),
    },
    {
      label: "η = n/|H|",
      title: "Modification frequency",
      render: (m) => <Pct value={m.totals.modificationFrequency} />,
    },
    {
      label: "λ churn",
      title: "Total changed lines (l+ + l−)",
      render: (m) => fmt(m.totals.churn),
    },
    {
      label: "l+ added",
      render: (m) => (
        <span className="text-green-600 dark:text-green-400">
          +{fmt(m.totals.added)}
        </span>
      ),
    },
    {
      label: "l− removed",
      render: (m) => (
        <span className="text-red-600 dark:text-red-400">
          −{fmt(m.totals.removed)}
        </span>
      ),
    },
    {
      label: "δ growth",
      title: "l+ − l−",
      render: (m) => <Delta value={m.totals.growth} />,
    },
    {
      label: "ρ = λ/|H|",
      title: "Churn rate",
      render: (m) => <Pct value={m.totals.churnRate} />,
    },
    {
      label: "Files measured / H[F]",
      title: "Files with measured changes / files ever changed",
      render: (m) =>
        `${fmt(m.totals.measuredFileCount)} / ${fmt(m.totals.fileCount)}`,
    },
    {
      label: "Directories",
      render: (m) => fmt(m.totals.directoryCount),
    },
    {
      label: "Authors",
      title: "Canonical identities (after .mailmap merging)",
      render: (m) => fmt(m.totals.authorCount),
    },
    {
      label: "First commit",
      render: (m) =>
        m.totals.firstCommitterTs
          ? dateFormat.format(new Date(m.totals.firstCommitterTs * 1000))
          : "—",
    },
    {
      label: "Last commit",
      render: (m) =>
        m.totals.lastCommitterTs
          ? dateFormat.format(new Date(m.totals.lastCommitterTs * 1000))
          : "—",
    },
  ];
}

/** Side-by-side commit-set metrics for up to six analyzed repositories. */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params.repos;
  const requested = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter(
    isValidRepoId,
  );
  const unique = [...new Set(requested)];
  const truncated = unique.length > MAX_COMPARE;
  const selected = unique.slice(0, MAX_COMPARE);

  const repos = await listRepos();
  const byId = new Map(repos.map((repo) => [repo.id, repo]));

  const columns: CompareColumn[] = [];
  for (const id of selected) {
    const entry = byId.get(id);
    if (!entry) continue;
    const analysis = analysisOf(entry);
    const ready = entry.status === "ready" && analysis.status === "ready";
    columns.push({
      entry,
      color: PALETTE[columns.length % PALETTE.length],
      metrics: ready ? await getRepositoryMetrics(id) : null,
      skipReason: ready
        ? null
        : entry.status !== "ready"
          ? "repository not ready"
          : `history ${analysis.status}`,
    });
  }
  const compared = columns.filter((column) => column.metrics);
  const series: CompareSeries[] = compared.map((column) => ({
    id: column.entry.id,
    name: column.entry.name,
    color: column.color,
    buckets: column.metrics!.timeline,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Compare repositories
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Side-by-side commit-set metrics over each repository&apos;s full
          history H̄.
        </p>
      </header>

      <form
        method="get"
        action="/compare"
        className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
      >
        <fieldset>
          <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Repositories
          </legend>
          {repos.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No repositories yet — add and analyze one first.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {repos.map((repo) => {
                const analysis = analysisOf(repo);
                const eligible =
                  repo.status === "ready" && analysis.status === "ready";
                return (
                  <label
                    key={repo.id}
                    className={`flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 ${
                      eligible
                        ? "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"
                        : "opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="repos"
                      value={repo.id}
                      defaultChecked={selected.includes(repo.id)}
                      disabled={!eligible}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="truncate">{repo.name}</span>
                    {eligible ? (
                      <span className="ml-auto shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                        {analysis.status === "ready"
                          ? `${(analysis.commitCount ?? 0).toLocaleString("en-US")} commits`
                          : ""}
                      </span>
                    ) : (
                      <span className="ml-auto shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                        not analyzed
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Pick up to {MAX_COMPARE} analyzed repositories.
          </p>
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Compare
          </button>
        </div>
      </form>

      {truncated ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
          More than {MAX_COMPARE} repositories were selected — showing the
          first {MAX_COMPARE}.
        </p>
      ) : null}
      {columns.some((column) => column.skipReason) ? (
        <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
          Skipped:{" "}
          {columns
            .filter((column) => column.skipReason)
            .map((column) => `${column.entry.name} (${column.skipReason})`)
            .join(", ")}
          .
        </p>
      ) : null}

      {compared.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Select at least one analyzed repository above to compare metrics.
        </p>
      ) : (
        <div className="mt-8 space-y-8">
          <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Monthly churn, relative to each repo&apos;s peak month
              </h2>
              <div className="flex flex-wrap gap-3">
                {series.map((s) => (
                  <Link
                    key={s.id}
                    href={`/repos/${s.id}/metrics`}
                    className="inline-flex items-center gap-1.5 text-xs hover:underline"
                    title={`Open ${s.name} metrics`}
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </Link>
                ))}
              </div>
            </div>
            <CompareTimelineChart series={series} />
          </section>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {compared.map((column) => (
              <section
                key={column.entry.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <h3 className="mb-3 flex items-center gap-2 truncate text-sm font-semibold">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: column.color }}
                  />
                  <Link
                    href={`/repos/${column.entry.id}/metrics`}
                    className="truncate hover:underline"
                  >
                    {column.entry.name}
                  </Link>
                </h3>
                <TimelineBars buckets={column.metrics!.timeline} />
              </section>
            ))}
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Commit-set metrics
            </h2>
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Metric</th>
                    {compared.map((column) => (
                      <th
                        key={column.entry.id}
                        className="px-4 py-3 text-right font-medium"
                      >
                        <span className="inline-flex items-center justify-end gap-1.5 normal-case">
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: column.color }}
                          />
                          <Link
                            href={`/repos/${column.entry.id}/metrics`}
                            className="hover:underline"
                            title={`Open ${column.entry.name} metrics`}
                          >
                            {column.entry.name}
                          </Link>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {metricRows().map((row) => (
                    <tr
                      key={row.label}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                    >
                      <th
                        scope="row"
                        title={row.title}
                        className="px-4 py-2.5 text-left font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        {row.label}
                      </th>
                      {compared.map((column) => (
                        <td
                          key={column.entry.id}
                          className="px-4 py-2.5 text-right tabular-nums"
                        >
                          {row.render(column.metrics!)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
