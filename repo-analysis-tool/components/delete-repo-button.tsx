"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface DeleteRepoButtonProps {
  repoId: string;
  repoName: string;
  disabled?: boolean;
}

export default function DeleteRepoButton({
  repoId,
  repoName,
  disabled,
}: DeleteRepoButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete repository "${repoName}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/repos/${repoId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        window.alert(`Failed to delete "${repoName}" (HTTP ${res.status}).`);
        setDeleting(false);
        return;
      }
    } catch {
      window.alert(`Failed to delete "${repoName}" — network error.`);
      setDeleting(false);
      return;
    }
    startTransition(() => router.refresh());
  }

  const busy = deleting || pending;
  return (
    <button
      type="button"
      onClick={() => void handleDelete()}
      disabled={busy || disabled}
      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-red-400 dark:hover:border-red-900 dark:hover:bg-red-950/40"
    >
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
