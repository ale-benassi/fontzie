// A failed operation never blocks later work for the same owner.
export function createQueue() {
  const pending = new Map<string, Promise<unknown>>();
  let barrier: Promise<unknown> = Promise.resolve();
  function enqueue<T>(key: string, run: () => Promise<T>): Promise<T> {
    const work = Promise.allSettled([pending.get(key), barrier]).then(run);
    pending.set(key, work);
    void work
      .finally(() => {
        if (pending.get(key) === work) pending.delete(key);
      })
      .catch(() => {});
    return work;
  }
  // A reset waits for existing work across all keys and holds later work.
  enqueue.exclusive = <T>(run: () => Promise<T>) => {
    const work = Promise.allSettled([barrier, ...pending.values()]).then(run);
    barrier = work;
    return work;
  };
  return enqueue;
}
