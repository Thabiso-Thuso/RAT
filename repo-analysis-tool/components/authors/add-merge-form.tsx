"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export interface RawIdentityOption {
  name: string;
  email: string;
  commits: number;
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400";

/**
 * Form for adding a merge rule: pick (or type) a raw identity and the
 * canonical identity it should become. Writes to the repo's .mailmap via
 * the API; takes effect on the next request without re-analysis.
 */
export function AddMergeForm({
  repoId,
  identities,
}: {
  repoId: string;
  identities: RawIdentityOption[];
}) {
  const router = useRouter();
  const [rawName, setRawName] = useState("");
  const [rawEmail, setRawEmail] = useState("");
  const [canonicalName, setCanonicalName] = useState("");
  const [canonicalEmail, setCanonicalEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/repos/${repoId}/mailmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawName: rawName || null,
          rawEmail: rawEmail || null,
          canonicalName: canonicalName || null,
          canonicalEmail: canonicalEmail || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? `Request failed (${response.status})`);
        return;
      }
      setRawName("");
      setRawEmail("");
      setCanonicalName("");
      setCanonicalEmail("");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  };

  const pick = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const identity = identities[Number(event.target.value)];
    if (!identity) return;
    setRawName(identity.name);
    setRawEmail(identity.email);
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Add merge rule
        </h2>
        {identities.length > 0 ? (
          <select
            onChange={pick}
            defaultValue=""
            aria-label="Pick a raw identity to fill the form"
            className="max-w-xs rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Pick a raw identity…</option>
            {identities.map((identity, i) => (
              <option key={`${identity.name} <${identity.email}>`} value={i}>
                {identity.name} &lt;{identity.email}&gt; · {identity.commits}{" "}
                commits
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Raw name (as committed)
          <input
            value={rawName}
            onChange={(e) => setRawName(e.target.value)}
            placeholder="optional — matches any name if empty"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Raw email (as committed)
          <input
            value={rawEmail}
            onChange={(e) => setRawEmail(e.target.value)}
            placeholder="old@example.com"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Canonical name
          <input
            value={canonicalName}
            onChange={(e) => setCanonicalName(e.target.value)}
            placeholder="e.g. Alice Smith"
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          Canonical email
          <input
            value={canonicalEmail}
            onChange={(e) => setCanonicalEmail(e.target.value)}
            placeholder="optional — keeps the raw email if empty"
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-xs text-zinc-500 dark:text-zinc-400">
          Written to the repository&apos;s .mailmap and applied to all metrics
          immediately — no re-analysis needed. Leave the canonical email empty
          to rename only; leave the raw name empty to merge every identity
          with that email.
        </p>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {busy ? "Merging…" : "Merge identity"}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </form>
  );
}
