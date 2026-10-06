/**
 * Collapsible key explaining the metric symbols used across the tables,
 * the commit-set notation, and the sorting affordance. Plain <details>, so
 * it works without JavaScript.
 */

const ENTRIES: [symbol: string, meaning: string][] = [
  ["H̄", "non-merge commits reachable from HEAD (the analyzed history)"],
  ["H", "the selected commit set — all of H̄ narrowed by the filters"],
  ["H(t)", "commits with committer date ≤ t"],
  ["H(i,j)", "commits with i ≤ committer date < j (the 'Until' day counts)"],
  ["|H|", "number of commits in the commit set"],
  ["l+ / l−", "lines added / lines removed (binary files are never measured)"],
  ["δ", "growth = l+ − l− (green positive, red negative)"],
  ["λ", "churn = l+ + l− (total changed lines)"],
  ["n", "modifications: commits whose λ for the object is > 0 (pure renames don't count)"],
  ["η", "modification frequency = n / |H| (0 when |H| = 0)"],
  ["ρ", "churn rate = λ / |H| (0 when |H| = 0)"],
  ["ω", "ownership = λ(H,o,a) / λ(H,o) — an author's share of an object's churn"],
  ["H[F]", "files ever changed in H, including rename sources and binary-only files"],
  ["Touches", "commits that changed the object, including binary-only touches"],
  ["renamed from", "git detected a rename; the changes are attributed to the new path"],
];

export function MetricsLegend() {
  return (
    <details className="group rounded-xl border border-zinc-200 bg-zinc-50/60 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
      <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
        Key — symbols and metric definitions
        <span className="ml-2 inline-block transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="grid gap-x-8 gap-y-2 px-4 pb-3 pt-1 sm:grid-cols-2">
        {ENTRIES.map(([symbol, meaning]) => (
          <div key={symbol} className="flex gap-2">
            <span className="w-14 shrink-0 font-mono text-xs font-semibold">
              {symbol}
            </span>
            <span className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {meaning}
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
        Tip: click any column heading to sort the table by that column — click
        again to reverse the order (▲ ascending, ▼ descending).
      </p>
    </details>
  );
}
