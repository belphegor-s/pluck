import { PluckError } from "@pluck/shared";

/**
 * Time budgets that actually hold.
 *
 * Checking a clock between steps bounds nothing: the step in progress runs as
 * long as it likes. These helpers make the budget part of the work: a promise
 * that loses the race is abandoned, and an abort signal lets the work stop
 * itself at the next opportunity.
 */

/** Throws `target_timeout` if the signal has already fired. */
export function throwIfAborted(signal: AbortSignal | undefined, what = "request"): void {
  if (signal?.aborted) {
    throw new PluckError("target_timeout", `The ${what} ran out of time.`);
  }
}

/**
 * Settles with `promise`, or with the result of `onTimeout` once `ms` has
 * passed, whichever comes first. The losing promise is left to settle on its
 * own; pair this with an abort signal when the work can be stopped.
 */
export async function withDeadline<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => T | Promise<T>,
): Promise<T> {
  if (ms <= 0) return onTimeout();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<"expired">((resolve) => {
    timer = setTimeout(() => resolve("expired"), ms);
  });
  try {
    const winner = await Promise.race([promise, expiry]);
    return winner === "expired" ? await onTimeout() : (winner as T);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs `task` over `items` with at most `limit` in flight.
 *
 * Firing every item at once turns ten search results into ten simultaneous
 * browser renders against a pool of four, and the queue wait then dominates.
 */
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!, index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
