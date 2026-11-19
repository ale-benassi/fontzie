import { expect, it, vi } from "vitest";
import {
  createConcurrencyLimit,
  forEachConcurrent,
} from "../../core/concurrency";

it("shares preview slots across overlapping generations and skips obsolete queued work", async () => {
  const limit = createConcurrencyLimit();
  const started: number[] = [];
  const finish = new Map<number, () => void>();
  let generation = 0;
  const batch = (values: number[]) => {
    const owner = ++generation;
    return forEachConcurrent(
      values,
      async (value) => {
        await limit(
          () =>
            new Promise<void>((resolve) => {
              started.push(value);
              finish.set(value, resolve);
            }),
          () => owner === generation,
        );
      },
      3,
      () => owner === generation,
    );
  };
  const first = batch([0, 1, 2, 3]);
  const obsolete = batch([4, 5, 6, 7]);
  const latest = batch([8, 9, 10, 11]);
  expect(started).toEqual([0, 1, 2]);
  finish.get(0)?.();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 8]));
  finish.get(1)?.();
  finish.get(2)?.();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 8, 9, 10]));
  finish.get(8)?.();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 8, 9, 10, 11]));
  for (const id of [9, 10, 11]) finish.get(id)?.();
  await Promise.all([first, obsolete, latest]);
});

it("releases a shared preview slot after a failed request", async () => {
  const limit = createConcurrencyLimit(1);
  const failed = limit(async () => {
    throw Error("Offline");
  });
  const next = limit(async () => "loaded");
  await expect(failed).rejects.toThrow("Offline");
  expect(await next).toBe("loaded");
});

it("bounds parallel work and waits for started tasks before reporting failure", async () => {
  const started: number[] = [];
  const releases = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void }
  >();
  const run = forEachConcurrent([0, 1, 2, 3, 4], (value) => {
    started.push(value);
    return new Promise<void>((resolve, reject) =>
      releases.set(value, { resolve, reject }),
    );
  });
  let finished = false;
  const outcome = run
    .catch((error: unknown) => error)
    .finally(() => {
      finished = true;
    });
  expect(started).toEqual([0, 1, 2]);
  releases.get(1)?.resolve();
  await vi.waitFor(() => expect(started).toEqual([0, 1, 2, 3]));
  releases.get(0)?.reject(Error("Download failed"));
  releases.get(2)?.resolve();
  await Promise.resolve();
  expect(finished).toBe(false);
  releases.get(3)?.resolve();
  expect(await outcome).toEqual(Error("Download failed"));
  expect(started).toEqual([0, 1, 2, 3]);
});

it("stops starting obsolete previews while finishing work already in flight", async () => {
  let current = true;
  const started: number[] = [];
  await forEachConcurrent(
    [0, 1, 2, 3, 4],
    async (value) => {
      started.push(value);
      current = false;
    },
    3,
    () => current,
  );
  expect(started).toEqual([0]);
});
