/**
 * Run async tasks with a concurrency cap (reduces Prisma pool pressure).
 * @template T
 * @param {Array<() => Promise<T>>} factories
 * @param {number} concurrency
 * @returns {Promise<T[]>}
 */
export async function runWithConcurrency(factories, concurrency = 2) {
  const list = Array.isArray(factories) ? factories : [];
  const limit = Math.max(1, Math.min(8, Number(concurrency) || 2));
  const out = new Array(list.length);
  let next = 0;

  async function worker() {
    while (next < list.length) {
      const i = next++;
      out[i] = await list[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, list.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/** Run promises one after another. */
export async function runSerial(factories) {
  return runWithConcurrency(factories, 1);
}
