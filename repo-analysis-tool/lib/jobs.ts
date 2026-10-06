/**
 * In-process map of background tasks (zip ingestion / clone) keyed by repoId.
 *
 * Status is persisted in index.json so the UI survives restarts; this map
 * only tracks which tasks are currently executing in this process (mainly to
 * keep DELETE vs. job races observable and promises referenced).
 */

const running = new Map<string, Promise<void>>();

/** Fire-and-forget: the task is responsible for its own error handling. */
export function startJob(id: string, task: () => Promise<void>): void {
  const job = task();
  running.set(id, job);
  void job.finally(() => {
    if (running.get(id) === job) running.delete(id);
  });
}

export function isJobRunning(id: string): boolean {
  return running.has(id);
}
