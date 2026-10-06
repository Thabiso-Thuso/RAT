import Link from "next/link";

import { analysisOf } from "@/lib/history";
import type { RepoEntry } from "@/lib/types";
import { MetricNav, type MetricCategory } from "@/components/metrics/icons";

/** Common chrome for all metric pages: repo header + category navigation. */
export function MetricsShell({
  repo,
  active,
  children,
}: {
  repo: RepoEntry;
  active: MetricCategory["key"];
  children: React.ReactNode;
}) {
  const analysis = analysisOf(repo);
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-6">
        <Link
          href="/repositories"
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Manage repositories
        </Link>
        <h1 className="mt-2 flex flex-wrap items-baseline gap-x-3 text-xl font-semibold tracking-tight">
          {repo.name}
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {repo.source === "url" && repo.url ? repo.url : "zip upload"}
          </span>
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Non-merge history from HEAD ({analysis.status === "ready" ? `${analysis.commitCount} commits` : "not analyzed"})
          {analysis.analyzedAt
            ? ` · analyzed ${new Date(analysis.analyzedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </p>
      </header>
      <div className="mb-6">
        <MetricNav repoId={repo.id} active={active} />
      </div>
      {children}
    </main>
  );
}
