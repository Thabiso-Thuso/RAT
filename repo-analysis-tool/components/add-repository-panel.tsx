"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { RepoEntry, RepoStatus } from "@/lib/types";

type Tab = "upload" | "url";

interface Notice {
  kind: "busy" | "success" | "error";
  text: string;
}

const TERMINAL_STATUSES: RepoStatus[] = ["ready", "error"];

/**
 * "Add repository" panel: upload a .zip (with progress) or clone a URL.
 * Submissions return immediately with a repoId; we poll until the job
 * reaches a terminal state, then refresh the server-rendered list.
 */
export default function AddRepositoryPanel() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [pollRepoId, setPollRepoId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll the in-flight repo until ready/error, then refresh the table.
  useEffect(() => {
    if (!pollRepoId) return;
    let cancelled = false;
    let polls = 0;
    const timer = setInterval(async () => {
      polls += 1;
      try {
        const res = await fetch(`/api/repos/${pollRepoId}`);
        if (res.status === 404) {
          if (!cancelled) {
            setPollRepoId(null);
            setNotice({ kind: "error", text: "Repository was deleted." });
          }
          return;
        }
        if (!res.ok) return;
        const repo = (await res.json()) as RepoEntry;
        if (!TERMINAL_STATUSES.includes(repo.status)) return;
        // A ready repo transitions straight into auto-analysis; keep polling
        // until the analysis reaches a terminal state too. If the analysis
        // field never appears (e.g. legacy entry), give up after ~20 polls.
        if (repo.status === "ready") {
          const analysis = repo.analysis;
          if (!analysis && polls < 20) return;
          if (analysis && analysis.status !== "analyzing" && analysis.status !== "unanalyzed") {
            if (cancelled) return;
            setPollRepoId(null);
            setBusy(false);
            if (analysis.status === "ready") {
              setNotice({
                kind: "success",
                text: `"${repo.name}" added and analyzed — ${analysis.commitCount} commits.`,
              });
            } else {
              setNotice({
                kind: "error",
                text: `"${repo.name}" added, but analysis failed: ${analysis.error ?? "unknown error"}`,
              });
            }
            setFile(null);
            setUrl("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            router.refresh();
          }
          return;
        }
        if (cancelled) return;
        setPollRepoId(null);
        setBusy(false);
        setNotice({
          kind: "error",
          text: `Failed to add "${repo.name}": ${repo.error ?? "unknown error"}`,
        });
        setFile(null);
        setUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } catch {
        // Transient network error — keep polling.
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollRepoId, router]);

  async function handleUploadSubmit() {
    if (!file || busy) return;
    setBusy(true);
    setNotice({ kind: "busy", text: `Uploading ${file.name}…` });
    setUploadProgress(0);

    const form = new FormData();
    form.append("file", file);

    try {
      const { status, body } = await uploadWithProgress(form, (fraction) => {
        setUploadProgress(Math.round(fraction * 100));
      });
      if (status !== 201) {
        let message = `Upload failed (HTTP ${status}).`;
        try {
          message = (JSON.parse(body) as { error?: string }).error ?? message;
        } catch {
          // Non-JSON error body — keep default message.
        }
        setNotice({ kind: "error", text: message });
        setBusy(false);
        setUploadProgress(null);
        return;
      }
      const { id } = JSON.parse(body) as { id: string };
      setNotice({ kind: "busy", text: "Extracting…" });
      setUploadProgress(null);
      setPollRepoId(id);
      router.refresh(); // show the new row immediately
    } catch {
      setNotice({ kind: "error", text: "Upload failed — network error." });
      setBusy(false);
      setUploadProgress(null);
    }
  }

  async function handleCloneSubmit() {
    if (busy) return;
    const trimmed = url.trim();
    if (!trimmed) {
      setNotice({ kind: "error", text: "Enter a repository URL." });
      return;
    }
    setBusy(true);
    setNotice({ kind: "busy", text: "Starting clone…" });
    try {
      const res = await fetch("/api/repos/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const payload = (await res.json()) as { id?: string; error?: string };
      if (res.status !== 201 || !payload.id) {
        setNotice({
          kind: "error",
          text: payload.error ?? `Request failed (HTTP ${res.status}).`,
        });
        setBusy(false);
        return;
      }
      setNotice({ kind: "busy", text: "Cloning (full history)…" });
      setPollRepoId(payload.id);
      router.refresh(); // show the new row immediately
    } catch {
      setNotice({ kind: "error", text: "Request failed — network error." });
      setBusy(false);
    }
  }

  const progress =
    uploadProgress !== null ? (
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${uploadProgress}%` }}
        />
      </div>
    ) : null;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-4 flex items-center gap-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <TabButton
          active={tab === "upload"}
          onClick={() => setTab("upload")}
        >
          Upload .zip
        </TabButton>
        <TabButton active={tab === "url"} onClick={() => setTab("url")}>
          Clone URL
        </TabButton>
      </div>

      {tab === "upload" ? (
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full cursor-pointer rounded-lg border border-zinc-300 text-sm text-zinc-600 file:mr-4 file:cursor-pointer file:rounded-l-lg file:border-0 file:bg-zinc-100 file:px-4 file:py-2.5 file:text-sm file:font-medium hover:file:bg-zinc-200 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-200 dark:hover:file:bg-zinc-700"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Zip the repository folder including its .git directory (max
            300&nbsp;MB).
          </p>
          <button
            type="button"
            onClick={handleUploadSubmit}
            disabled={!file || busy}
            className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working…" : "Add repository"}
          </button>
          {progress}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleCloneSubmit();
            }}
            placeholder="https://github.com/user/repo.git or file:///absolute/path"
            className="w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-blue-500 disabled:opacity-50 dark:border-zinc-700"
          />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Supports http(s)://, ssh://, git:// and file:// URLs. Clones the
            full history.
          </p>
          <button
            type="button"
            onClick={() => void handleCloneSubmit()}
            disabled={busy || !url.trim()}
            className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Working…" : "Clone repository"}
          </button>
        </div>
      )}

      {notice ? (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            notice.kind === "error"
              ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
              : notice.kind === "success"
                ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
          }`}
          role="status"
        >
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-1 pb-2 text-sm font-medium transition-colors ${
        active
          ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

/** XHR-based upload so we get progress events (fetch doesn't provide them). */
function uploadWithProgress(
  form: FormData,
  onProgress: (fraction: number) => void,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/repos");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(form);
  });
}
