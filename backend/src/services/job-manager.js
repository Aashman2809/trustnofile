

// Creates the in-process analysis job manager.
export function createInProcessJobManager({ concurrency = 2 } = {}) {
  const queue = []; let running = 0; let waiters = [];

  // Completes settle operation.
  const settle = () => { if (!running && !queue.length) { waiters.forEach(/* Processes each item in the collection. */ (w) => w()); waiters = []; } };

  // Processes pump operation.
  const pump = () => {
    while (running < concurrency && queue.length) {
      const job = queue.shift(); running++;
      Promise.resolve().then(job).catch(/* Handles the asynchronous error. */ () => {}).finally(/* Runs cleanup after the asynchronous operation. */ () => { running--; pump(); settle(); });
    }
  };
  return {

    // Queues enqueue operation.
    enqueue(fn) { queue.push(fn); pump(); },

    // Handles idle.
    onIdle() { return running || queue.length ? new Promise(/* Handles the callback for this operation. */ (r) => waiters.push(r)) : Promise.resolve(); },
  };
}
