"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { RepoIcon } from "@/components/metrics/icons";

/** Plain data the server sidebar hands over (no store imports on the client). */
export interface SidebarRepo {
  id: string;
  name: string;
  status: string;
  analysisStatus: string;
  commitCount?: number;
}

function statusDot(repo: SidebarRepo): string {
  if (repo.status === "error" || repo.analysisStatus === "error") {
    return "bg-red-500";
  }
  if (repo.status !== "ready" || repo.analysisStatus === "analyzing") {
    return "animate-pulse bg-blue-500";
  }
  if (repo.analysisStatus === "ready") return "bg-green-500";
  return "bg-zinc-400 dark:bg-zinc-600";
}

function statusLabel(repo: SidebarRepo): string {
  if (repo.status === "error") return "Repository import failed";
  if (repo.status === "extracting") return "Extracting zip…";
  if (repo.status === "cloning") return "Cloning repository…";
  switch (repo.analysisStatus) {
    case "analyzing":
      return "History analysis running…";
    case "error":
      return "History analysis failed";
    case "ready":
      return `Ready — ${(repo.commitCount ?? 0).toLocaleString("en-US")} commits`;
    default:
      return "History not analyzed yet";
  }
}

/** Repo list with client-side search and active-route highlighting. */
export function SidebarNav({ repos }: { repos: SidebarRepo[] }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return repos;
    return repos.filter((repo) => repo.name.toLowerCase().includes(needle));
  }, [repos, query]);

  return (
    <aside className="sticky top-0 z-30 w-full shrink-0 border-b border-zinc-200 bg-zinc-50/95 backdrop-blur lg:h-screen lg:w-64 lg:border-b-0 lg:border-r dark:border-zinc-800 dark:bg-zinc-900/80">
      <div className="flex h-full flex-col gap-3 p-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          title="Dashboard"
        >
          <RepoIcon className="h-5 w-5" />
          RAT
          <span className="truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
            Repository Analysis Tool
          </span>
        </Link>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search repositories…"
          aria-label="Search repositories"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
        />

        <nav
          aria-label="Repositories"
          className="-mx-1 max-h-72 flex-1 overflow-y-auto px-1 lg:max-h-none"
        >
          {repos.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              No repositories yet — add one to get started.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-3 text-xs text-zinc-500 dark:text-zinc-400">
              No repositories match “{query.trim()}”.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((repo) => {
                const href = `/repos/${repo.id}/metrics`;
                const active =
                  pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={repo.id}>
                    <Link
                      href={href}
                      title={statusLabel(repo)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        active
                          ? "bg-zinc-200/80 font-medium text-zinc-900 dark:bg-zinc-700/60 dark:text-zinc-50"
                          : "text-zinc-700 hover:bg-zinc-200/50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-full ${statusDot(repo)}`}
                      />
                      <span className="truncate">{repo.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </nav>

        <Link
          href="/repositories"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-center text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Manage repositories
        </Link>
      </div>
    </aside>
  );
}
