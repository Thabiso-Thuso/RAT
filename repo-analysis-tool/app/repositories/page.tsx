import AddRepositoryPanel from "@/components/add-repository-panel";
import AnalyzeRepoButton from "@/components/analyze-repo-button";
import DeleteRepoButton from "@/components/delete-repo-button";
import { MetricsIconLinks } from "@/components/metrics/icons";
import { analysisOf } from "@/lib/history";
import { listRepos } from "@/lib/repo-store";
import type { RepoEntry, RepoStatus } from "@/lib/types";

// The list comes from the filesystem registry; always render fresh.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<RepoStatus, string> = {
  extracting: "Extracting",
  cloning: "Cloning",
  ready: "Ready",
  error: "Error",
};

function StatusBadge({ status }: { status: RepoStatus }) {
  const styles: Record<RepoStatus, string> = {
    extracting:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900",
    cloning:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900",
    ready:
      "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-900",
    error:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900",
  };
  const pending = status === "extracting" || status === "cloning";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {pending ? (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {STATUS_LABELS[status]}
    </span>
  );
}

function SourceBadge({ source }: { source: RepoEntry["source"] }) {
  return (
    <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
      {source === "zip" ? "zip" : "url"}
    </span>
  );
}

const ANALYSIS_LABELS = {
  unanalyzed: "Not analyzed",
  analyzing: "Analyzing",
  ready: "Analyzed",
  error: "Failed",
} as const;

function AnalysisCell({ repo }: { repo: RepoEntry }) {
  const analysis = analysisOf(repo);
  if (repo.status !== "ready") {
    return <span className="text-zinc-400 dark:text-zinc-600">—</span>;
  }
  if (analysis.status === "ready") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400"
          title="Non-merge commits ingested for metric analysis (merges are excluded per the metrics spec)."
        >
          {ANALYSIS_LABELS.ready} · {analysis.commitCount}
        </span>
        <AnalyzeRepoButton repoId={repo.id} label="Re-analyze" />
      </div>
    );
  }
  if (analysis.status === "analyzing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
        {ANALYSIS_LABELS.analyzing}
      </span>
    );
  }
  if (analysis.status === "error") {
    return (
      <div className="flex flex-col items-start gap-1">
        <span className="max-w-56 text-xs text-red-600 dark:text-red-400" title={analysis.error}>
          {analysis.error}
        </span>
        <AnalyzeRepoButton repoId={repo.id} label="Retry" />
      </div>
    );
  }
  return <AnalyzeRepoButton repoId={repo.id} label="Analyze" />;
}

export default async function RepositoriesPage() {
  const repos = await listRepos();

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Repositories
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Add git repositories by zip upload or URL clone, then keep track of
          them here.
        </p>
      </header>

      <AddRepositoryPanel />

      <section className="mt-10">
        <h2 className="mb-4 flex items-baseline gap-2 text-lg font-semibold">
          All repositories
          <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
            ({repos.length})
          </span>
        </h2>

        {repos.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No repositories yet. Upload a zip or clone a URL above to get
            started.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">History</th>
                  <th
                    className="px-4 py-3 font-medium"
                    title="File, directory, repository, author and commit-set metrics"
                  >
                    Metrics
                  </th>
                  <th
                    className="px-4 py-3 font-medium"
                    title="Non-merge commits reachable from HEAD (per the metrics spec, merge commits are not measured)."
                  >
                    Commits
                  </th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {repos.map((repo) => (
                  <tr
                    key={repo.id}
                    className="align-top hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium">{repo.name}</span>
                      {repo.url ? (
                        <span
                          className="mt-0.5 block max-w-56 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400"
                          title={repo.url}
                        >
                          {repo.url}
                        </span>
                      ) : null}
                      {repo.status === "error" && repo.error ? (
                        <span className="mt-1 block max-w-72 text-xs text-red-600 dark:text-red-400">
                          {repo.error}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <SourceBadge source={repo.source} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={repo.status} />
                    </td>
                    <td className="px-4 py-3">
                      <AnalysisCell repo={repo} />
                    </td>
                    <td className="px-4 py-3">
                      <MetricsIconLinks
                        repoId={repo.id}
                        analyzed={
                          repo.status === "ready" &&
                          analysisOf(repo).status === "ready"
                        }
                      />
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {repo.status === "ready" ? repo.commitCount : "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                      {new Date(repo.addedAt).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeleteRepoButton
                        repoId={repo.id}
                        repoName={repo.name}
                        disabled={
                          repo.status === "extracting" ||
                          repo.status === "cloning"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
