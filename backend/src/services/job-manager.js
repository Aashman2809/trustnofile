/**
 * Job manager contract: enqueue(fn) -> void; onIdle() -> Promise resolved when no jobs are queued or running.
 * This in-process implementation LOSES queued/running jobs when the backend restarts
 * (the orchestrator marks such analyses FAILED on next startup). Replace with a durable queue later.
 */
export function createInProcessJobManager({ concurrency = 2 } = {}) {
  const queue = []; let running = 0; let waiters = [];
  const settle = () => { if (!running && !queue.length) { waiters.forEach((w) => w()); waiters = []; } };
  const pump = () => {
    while (running < concurrency && queue.length) {
      const job = queue.shift(); running++;
      Promise.resolve().then(job).catch(() => {}).finally(() => { running--; pump(); settle(); });
    }
  };
  return {
    enqueue(fn) { queue.push(fn); pump(); },
    onIdle() { return running || queue.length ? new Promise((r) => waiters.push(r)) : Promise.resolve(); },
  };
}
