"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { RepoEntry } from "@/lib/types";

interface AnalyzeRepoButtonProps {
  repoId: string;
  label: string;
}

/**
 * Triggers (re-)analysis and polls until the analysis reaches a terminal
 * state, refreshing the server-rendered table along the way.
 */
export default function AnalyzeRepoButton({
  repoId,
  label,
}: AnalyzeRepoButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/repos/${repoId}`);
        if (res.status === 404 || !res.ok) {
          if (!cancelled) setPolling(false);
          return;
        }
        const repo = (await res.json()) as RepoEntry;
        const status = repo.analysis?.status ?? "unanalyzed";
        if (status === "ready" || status === "error") {
          if (!cancelled) {
            setPolling(false);
            setPending(false);
            router.refresh();
          }
        }
      } catch {
        // Transient network error — keep polling.
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, repoId, router]);

  async function handleAnalyze() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/repos/${repoId}/analyze`, {
        method: "POST",
      });
      if (res.status === 202) {
        setPolling(true);
        router.refresh(); // flip the row to "Analyzing"
        return;
      }
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(payload.error ?? `Analysis failed to start (HTTP ${res.status}).`);
      setPending(false);
    } catch {
      window.alert("Analysis failed to start — network error.");
      setPending(false);
    }
  }

  const busy = pending || polling;
  return (
    <button
      type="button"
      onClick={() => void handleAnalyze()}
      disabled={busy}
      className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-400"
    >
      {busy ? "Analyzing…" : label}
    </button>
  );
}
