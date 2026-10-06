import Link from "next/link";

import { analysisOf, listAuthorIdentities } from "@/lib/history";
import {
  isMailmapRule,
  readMailmapLines,
  type MailmapRule,
} from "@/lib/mailmap";
import { getRepo, isValidRepoId, repoDir } from "@/lib/repo-store";
import { AddMergeForm } from "@/components/authors/add-merge-form";
import { DeleteMergeButton } from "@/components/authors/delete-merge-button";
import { fmt } from "@/components/metrics/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Author identity management: view canonical groups, edit merge rules. */
export default async function AuthorsManagePage({
  params,
}: {
  params: Promise<{ repoId: string }>;
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

  const analysis = analysisOf(repo);
  if (repo.status !== "ready" || analysis.status !== "ready") {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          {repo.status !== "ready"
            ? "Repository import has not finished yet."
            : analysis.status === "analyzing"
              ? "History analysis is still running — author identities become available once it completes."
              : analysis.status === "error"
                ? `History analysis failed: ${analysis.error ?? "unknown error"}`
                : "Analyze the repository's history first to see author identities."}
        </p>
      </main>
    );
  }

  const groups = await listAuthorIdentities(repoId);
  const lines = await readMailmapLines(repoDir(repoId));
  const rules = lines
    .map((line, index) => ({ line, index }))
    .filter(
      (entry): entry is { line: MailmapRule; index: number } =>
        isMailmapRule(entry.line),
    );
  const flatIdentities = groups
    .flatMap((group) => group.identities)
    .map((identity) => ({ ...identity }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-6">
        <Link
          href={`/repos/${repoId}/metrics`}
          className="text-xs text-zinc-500 hover:underline dark:text-zinc-400"
        >
          ← Metrics overview
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Authors — {repo.name}
        </h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Identities are merged through the repository&apos;s .mailmap
          (gitmailmap(5)) at query time. Every metric that involves authors
          reflects the rules below immediately.
        </p>
      </header>

      <div className="space-y-8">
        <AddMergeForm repoId={repoId} identities={flatIdentities} />

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Merge rules (.mailmap)
          </h2>
          {rules.length === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              No merge rules yet — identities are shown exactly as committed.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
              {rules.map(({ line, index }) => (
                <li
                  key={index}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <code className="min-w-0 truncate font-mono text-xs">
                    {line.line}
                  </code>
                  <DeleteMergeButton
                    repoId={repoId}
                    index={index}
                    line={line.line}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-baseline justify-between text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Canonical authors ({groups.length})
            <Link
              href={`/repos/${repoId}/metrics/authors`}
              className="text-xs font-normal normal-case hover:underline"
            >
              metrics view →
            </Link>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Author</th>
                  <th className="px-4 py-3 text-right font-medium">Commits</th>
                  <th className="px-4 py-3 font-medium">Merged identities</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {groups.map((group) => {
                  const key = `${group.canonical.name} <${group.canonical.email}>`;
                  return (
                    <tr
                      key={key}
                      className="align-top hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/repos/${repoId}/metrics/author?key=${encodeURIComponent(key)}`}
                          className="font-medium hover:underline"
                          title={key}
                        >
                          {group.canonical.name || "(no name)"}
                        </Link>
                        <span className="mt-0.5 block truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          &lt;{group.canonical.email}&gt;
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {fmt(group.commits)}
                      </td>
                      <td className="px-4 py-3">
                        {group.identities.length > 1 ? (
                          <span className="mb-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
                            merged from {group.identities.length}
                          </span>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          {group.identities.map((identity) => (
                            <span
                              key={`${identity.name} <${identity.email}>`}
                              className="inline-flex max-w-full items-baseline gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
                              title={`${identity.name} <${identity.email}>`}
                            >
                              <span className="truncate">
                                {identity.name || "(no name)"} &lt;
                                {identity.email}&gt;
                              </span>
                              <span className="shrink-0 tabular-nums text-zinc-400 dark:text-zinc-500">
                                {fmt(identity.commits)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
