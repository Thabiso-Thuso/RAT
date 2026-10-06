import Link from "next/link";

import type { CommitSetMetrics, TimelineBucket } from "@/lib/metrics";

/**
 * Server-safe building blocks for the metrics pages: formatting, filter bar
 * (plain GET form — works without JavaScript), sortable table headers,
 * pagination, monthly timeline bars, and the summary grid.
 */

export type QueryParams = Record<string, string | undefined>;

const numberFormat = new Intl.NumberFormat("en-US");

export function fmt(n: number): string {
  return numberFormat.format(n);
}

/** Fraction metric (η, ρ, ω) as a percentage with the exact value on hover. */
export function Pct({ value }: { value: number }) {
  return (
    <span className="tabular-nums" title={value.toFixed(6)}>
      {(value * 100).toFixed(1)}%
    </span>
  );
}

/** Signed growth δ: green when positive, red when negative. */
export function Delta({ value }: { value: number }) {
  const tone =
    value > 0
      ? "text-green-600 dark:text-green-400"
      : value < 0
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-500 dark:text-zinc-400";
  return (
    <span className={`tabular-nums ${tone}`}>
      {value > 0 ? "+" : ""}
      {fmt(value)}
    </span>
  );
}

/** Compose a href from the current query params plus overrides. */
export function buildHref(
  base: string,
  current: QueryParams,
  overrides: QueryParams = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...current, ...overrides })) {
    if (value !== undefined && value.length > 0) search.set(key, value);
  }
  const qs = search.toString();
  return qs.length > 0 ? `${base}?${qs}` : base;
}

function toDateInput(value: string | undefined): string {
  if (!value) return "";
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds)) return "";
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

/**
 * Commit-set filter bar (author substring + H(i,j) committer-date bounds).
 * A plain GET form, so filtering works without client JS. `untilExclusive`
 * marks the j input as exclusive (the picked day IS included; the page adds
 * one day when parsing).
 */
export function FilterBar({
  action,
  current,
  showSearch = false,
  showAuthor = true,
  searchLabel = "Search",
  searchPlaceholder = "",
  hidden = {},
}: {
  action: string;
  current: QueryParams;
  showSearch?: boolean;
  /** Show the author commit filter (off on the authors page). */
  showAuthor?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  /** Params preserved invisibly across submits (e.g. file path, author key). */
  hidden?: QueryParams;
}) {
  const inputClass =
    "rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <form
      action={action}
      method="get"
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"
    >
      {showAuthor ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Author
          <input
            type="text"
            name="author"
            defaultValue={current.author ?? ""}
            placeholder="name or email"
            className={inputClass}
          />
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        From (i, inclusive)
        <input
          type="date"
          name="since"
          defaultValue={toDateInput(current.since)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
        Until (j, exclusive)
        <input
          type="date"
          name="until"
          defaultValue={toDateInput(
            current.until ? String(Number.parseInt(current.until, 10) - 86400) : undefined,
          )}
          title="Exclusive upper bound; the picked day is included."
          className={inputClass}
        />
      </label>
      {showSearch ? (
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          {searchLabel}
          <input
            type="text"
            name="search"
            defaultValue={current.search ?? ""}
            placeholder={searchPlaceholder}
            className={inputClass}
          />
        </label>
      ) : null}
      {Object.entries(hidden)
        .filter(([, value]) => value !== undefined && value.length > 0)
        .map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
      <button
        type="submit"
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        Apply
      </button>
      <Link
        href={buildHref(action, {}, hidden)}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        Reset
      </Link>
    </form>
  );
}

/** Table header cell that toggles sorting while preserving filters. */
export function SortHeader({
  label,
  sortKey,
  action,
  current,
}: {
  label: string;
  sortKey: string;
  action: string;
  current: QueryParams;
}) {
  const active = current.sort === sortKey;
  const defaultOrder = sortKey === "path" ? "asc" : "desc";
  const nextOrder =
    active && current.order === defaultOrder
      ? defaultOrder === "asc"
        ? "desc"
        : "asc"
      : defaultOrder;
  const directionHint = nextOrder === "asc" ? "ascending" : "descending";
  return (
    <th className="px-3 py-2 text-right font-medium first:px-4 last:pr-4">
      <Link
        href={buildHref(action, current, {
          sort: sortKey,
          order: nextOrder,
          offset: undefined,
        })}
        title={`Sort by ${label} (${directionHint}); click again to reverse`}
        className={`inline-flex cursor-pointer items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${
          active ? "text-zinc-900 dark:text-zinc-100" : ""
        }`}
      >
        {label}
        {active ? (
          <span aria-hidden>{current.order === "asc" ? "▲" : "▼"}</span>
        ) : (
          <span
            aria-hidden
            className="text-zinc-300 dark:text-zinc-600"
          >
            ⇅
          </span>
        )}
      </Link>
    </th>
  );
}

/** Offset/limit pagination footer preserving filters and sort. */
export function Pagination({
  action,
  current,
  offset,
  limit,
  total,
}: {
  action: string;
  current: QueryParams;
  offset: number;
  limit: number;
  total: number;
}) {
  if (total === 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
      <span>
        Showing {fmt(from)}–{fmt(to)} of {fmt(total)}
      </span>
      <span className="flex gap-2">
        {offset > 0 ? (
          <Link
            href={buildHref(action, current, {
              offset: String(Math.max(0, offset - limit)),
            })}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            ← Prev
          </Link>
        ) : null}
        {to < total ? (
          <Link
            href={buildHref(action, current, { offset: String(offset + limit) })}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Next →
          </Link>
        ) : null}
      </span>
    </div>
  );
}

/**
 * Monthly timeline (committer time): paired added/removed churn bars per
 * month, commits count on hover. Shows the most recent `months` buckets.
 */
export function TimelineBars({
  buckets,
  months = 24,
}: {
  buckets: TimelineBucket[];
  months?: number;
}) {
  if (buckets.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No commits in this commit set.
      </p>
    );
  }
  const shown = buckets.slice(-months);
  const hidden = buckets.length - shown.length;
  const max = Math.max(
    1,
    ...shown.map((b) => Math.max(b.added, b.removed)),
  );
  return (
    <div>
      <div className="flex h-36 items-end gap-[3px]">
        {shown.map((bucket) => (
          <div
            key={bucket.month}
            className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
            title={`${bucket.month}: ${fmt(bucket.commits)} commits, +${fmt(
              bucket.added,
            )} −${fmt(bucket.removed)}`}
          >
            <div
              className="w-full max-w-3 rounded-t-sm bg-green-500/80 dark:bg-green-400/70"
              style={{ height: `${Math.max(2, (bucket.added / max) * 100)}%` }}
            />
            <div
              className="w-full max-w-3 rounded-t-sm bg-red-400/80 dark:bg-red-400/60"
              style={{ height: `${Math.max(2, (bucket.removed / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-500">
        <span>{shown[0]?.month}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-green-500/80 dark:bg-green-400/70" />
            added
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-red-400/80 dark:bg-red-400/60" />
            removed
          </span>
        </span>
        <span>{shown[shown.length - 1]?.month}</span>
      </div>
      {hidden > 0 ? (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          (+{hidden} earlier month{hidden === 1 ? "" : "s"} not shown)
        </p>
      ) : null}
    </div>
  );
}

function Card({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
      title={title}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{children}</div>
    </div>
  );
}

/** Summary grid for commit-set metrics: |H|, n, η, ρ, l+, l-, δ, λ, objects. */
export function SummaryGrid({ totals }: { totals: CommitSetMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Card label="Commits |H|" title="Non-merge commits in the commit set">
        {fmt(totals.commitCount)}
      </Card>
      <Card
        label="Modifications n(H)"
        title="Commits with at least one measured change (λ > 0)"
      >
        {fmt(totals.modifications)}
      </Card>
      <Card label="η = n/|H|" title="Modification frequency">
        <Pct value={totals.modificationFrequency} />
      </Card>
      <Card label="ρ = λ/|H|" title="Churn rate">
        <Pct value={totals.churnRate} />
      </Card>
      <Card label="Added l+" title="Lines added over the commit set">
        <span className="text-green-600 dark:text-green-400">
          +{fmt(totals.added)}
        </span>
      </Card>
      <Card label="Removed l−" title="Lines removed over the commit set">
        <span className="text-red-600 dark:text-red-400">
          −{fmt(totals.removed)}
        </span>
      </Card>
      <Card label="Growth δ = l+ − l−" title="Net growth">
        <Delta value={totals.growth} />
      </Card>
      <Card label="Churn λ = l+ + l−" title="Total changed lines">
        {fmt(totals.churn)}
      </Card>
      <Card
        label="Files H[F]"
        title="Files ever changed (incl. rename sources and binary-only files)"
      >
        {fmt(totals.fileCount)}
        <span className="ml-1.5 text-xs font-normal text-zinc-400 dark:text-zinc-500">
          ({fmt(totals.measuredFileCount)} measured)
        </span>
      </Card>
      <Card label="Directories" title="Directories containing measured changes">
        {fmt(totals.directoryCount)}
      </Card>
      <Card label="Authors" title="Canonical authors (after mailmap merging)">
        {fmt(totals.authorCount)}
      </Card>
      <Card
        label="Window"
        title="Committer-time range of the commit set"
      >
        <span className="text-sm font-normal">
          {totals.firstCommitterTs !== null
            ? new Date(totals.firstCommitterTs * 1000)
                .toISOString()
                .slice(0, 10)
            : "—"}
          {" → "}
          {totals.lastCommitterTs !== null
            ? new Date(totals.lastCommitterTs * 1000).toISOString().slice(0, 10)
            : "—"}
        </span>
      </Card>
    </div>
  );
}

/** Panel shown when metrics are requested for an unanalyzed repository. */
export function MetricsGate({
  status,
  error,
}: {
  status: "unanalyzed" | "analyzing" | "error" | "ready";
  error?: string;
}) {
  const message =
    status === "analyzing"
      ? "History analysis is running — metrics appear once it completes."
      : status === "error"
        ? `History analysis failed: ${error ?? "unknown error"}`
        : status === "ready"
          ? "Metrics are unavailable for this commit set."
          : "This repository has no analyzed history yet. Run analysis from the repositories list first.";
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
      {message}
      <div className="mt-3">
        <Link
          href="/"
          className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          ← Back to repositories
        </Link>
      </div>
    </div>
  );
}
