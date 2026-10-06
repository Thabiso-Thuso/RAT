"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Removes one .mailmap rule (by line position) and refreshes the view. */
export function DeleteMergeButton({
  repoId,
  index,
  line,
}: {
  repoId: string;
  index: number;
  line: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await fetch(`/api/repos/${repoId}/mailmap?index=${index}`, {
        method: "DELETE",
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={remove}
      disabled={busy}
      title={`Remove rule: ${line}`}
      aria-label={`Remove rule: ${line}`}
      className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400"
    >
      {busy ? "…" : "✕"}
    </button>
  );
}
