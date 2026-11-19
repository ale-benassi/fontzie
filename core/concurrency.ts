// Share slots across successive preview batches. Releasing a slot reserves it
// for the next waiter, so newer batches cannot overtake queued work.
export function createConcurrencyLimit(limit = 3) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(
    run: () => Promise<T>,
    current: () => boolean = () => true,
  ): Promise<T | undefined> => {
    if (!current()) return;
    if (active < limit) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      if (current()) return await run();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

// Wait for every started task before returning a failure, so callers can safely
// roll back or release retained resources without older work still running.
export async function forEachConcurrent<T>(
  values: readonly T[],
  run: (value: T) => Promise<void>,
  limit = 3,
  current: () => boolean = () => true,
) {
  let index = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (!failed && current() && index < values.length) {
        const value = values[index++];
        if (value === undefined) continue;
        try {
          await run(value);
        } catch (error) {
          failed = true;
          failure = error;
        }
      }
    }),
  );
  if (failed) throw failure;
}
