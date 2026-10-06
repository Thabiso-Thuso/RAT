import {
  filtersFromParams,
  listOptionsFromParams,
  parseMetricDate,
  type ListOptions,
  type MetricFilters,
} from "@/lib/metrics";
import type { QueryParams } from "@/components/metrics/ui";

/**
 * Shared page-parameter plumbing: turn route searchParams into
 * (a) a string record for link building, (b) MetricFilters, and
 * (c) ListOptions, with one date-input nicety: an "until" value written as
 * a plain date (from FilterBar's date input) is treated as inclusive — the
 * page shifts it by one day so H(i, j) covers the whole picked day, per the
 * commit-set definition H(i,j) = {h : i ≤ t(h) < j}.
 */

export interface PageContext {
  repoId: string;
  /** String params for buildHref link building (filters + sort + paging). */
  query: QueryParams;
  filters: MetricFilters;
  list: ListOptions;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function pageContext(
  repoId: string,
  search: { [key: string]: string | string[] | undefined },
): PageContext {
  const query: QueryParams = {};
  for (const key of [
    "author",
    "since",
    "until",
    "search",
    "sort",
    "order",
    "offset",
  ] as const) {
    const value = first(search[key]);
    if (value !== undefined && value.length > 0) query[key] = value;
  }

  const filters = filtersFromParams(search);
  const untilRaw = first(search.until);
  if (
    untilRaw !== undefined &&
    /^\d{4}-\d{2}-\d{2}$/.test(untilRaw.trim())
  ) {
    // Whole picked day included: [00:00, next 00:00).
    const midnight = parseMetricDate(untilRaw);
    if (midnight !== null) filters.until = midnight + 86400;
  }

  // Normalize the link/filter record to unix seconds so FilterBar and sort /
  // pagination links stay consistent regardless of input format.
  if (filters.since !== undefined) query.since = String(filters.since);
  else delete query.since;
  if (filters.until !== undefined) query.until = String(filters.until);
  else delete query.until;

  return { repoId, query, filters, list: listOptionsFromParams(search) };
}
