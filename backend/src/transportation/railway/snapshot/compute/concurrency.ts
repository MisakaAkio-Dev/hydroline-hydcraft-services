export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) {
  const safeConcurrency = Math.max(1, Math.trunc(concurrency));
  const queue = items.slice();
  const workers: Array<Promise<void>> = [];
  const runWorker = async () => {
    while (queue.length) {
      const item = queue.shift()!;
      await handler(item);
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  for (let i = 0; i < safeConcurrency; i += 1) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
}
