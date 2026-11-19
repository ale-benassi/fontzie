import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  RootRegistry,
  roots,
  refreshRoots,
  scheduleRootRefresh,
  disposeRoots,
} from "../../content/roots";

let traversalWork = 0;
class Tree {
  nodeType = 1;
  isConnected = true;
  children: Tree[] = [];
  shadowRoot?: Tree;
  host?: Tree;
  ui = false;
  scans = 0;
  private parent: Tree | null = null;
  get parentElement(): Tree | null {
    traversalWork++;
    return this.parent?.nodeType === 1 ? this.parent : null;
  }
  append(...nodes: Tree[]) {
    for (const node of nodes) node.parent = this;
    this.children.push(...nodes);
  }
  closest() {
    return this.ui ? this : null;
  }
  contains(node: Tree): boolean {
    traversalWork++;
    return this.children.some(
      (child) => child === node || child.contains(node),
    );
  }
  querySelectorAll() {
    this.scans++;
    const descend = (node: Tree): Tree[] =>
      node.children.flatMap((child) => [child, ...descend(child)]);
    return descend(this);
  }
}
let observer: {
  queue: MutationRecord[];
  callback: MutationCallback;
  disconnect: ReturnType<typeof vi.fn>;
};
let document: Tree;
let registry: RootRegistry;
const added = (node: Tree) =>
  ({ addedNodes: [node] }) as unknown as MutationRecord;
beforeEach(() => {
  vi.stubGlobal(
    "MutationObserver",
    class {
      queue: MutationRecord[] = [];
      disconnect = vi.fn();
      constructor(public callback: MutationCallback) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias -- Expose the fake observer instance so tests can deliver mutation batches.
        observer = this;
      }
      observe() {}
      takeRecords() {
        return this.queue.splice(0);
      }
    },
  );
  document = new Tree();
  document.nodeType = 9;
  traversalWork = 0;
});
afterEach(() => {
  registry?.dispose();
  disposeRoots();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("coalesces routine discovery and still finds roots attached to existing hosts", () => {
  vi.useFakeTimers();
  vi.stubGlobal("document", document);
  const host = new Tree();
  document.append(host);
  refreshRoots();
  shadow(host);
  for (let index = 0; index < 20; index++) scheduleRootRefresh();
  expect(document.scans).toBe(1);
  vi.advanceTimersByTime(500);
  expect(document.scans).toBe(2);
  expect(roots()).toHaveLength(2);
  scheduleRootRefresh();
  disposeRoots();
  vi.runAllTimers();
  expect(document.scans).toBe(2);
});
function start() {
  return (registry = new RootRegistry(document as unknown as Document));
}
function shadow(host: Tree) {
  const root = new Tree();
  root.nodeType = 11;
  root.host = host;
  host.shadowRoot = root;
  return root;
}

it("discovers nested open roots once and shares repeated reads without document scans", () => {
  const host = new Tree(),
    nested = new Tree();
  document.append(host);
  const outer = shadow(host);
  outer.append(nested);
  shadow(nested);
  start();
  for (let index = 0; index < 100; index++)
    expect(registry.roots()).toHaveLength(3);
  expect(document.scans).toBe(1);
  expect(outer.scans).toBe(1);
});
it("flushes inserted subtrees synchronously without rescanning the document", () => {
  start();
  const host = new Tree();
  shadow(host);
  document.append(host);
  observer.queue.push(added(host));
  expect(registry.roots()).toHaveLength(2);
  expect(document.scans).toBe(1);
  expect(host.scans).toBe(1);
});
it("does not scan overlapping inserted subtrees twice", () => {
  start();
  const parent = new Tree(),
    host = new Tree();
  shadow(host);
  parent.append(host);
  document.append(parent);
  observer.queue.push(added(parent), added(host));
  expect(registry.roots()).toHaveLength(2);
  expect(parent.scans).toBe(1);
  expect(host.scans).toBe(0);
});
it("prunes disconnected roots, notifies subscribers, and releases observation", () => {
  const host = new Tree();
  shadow(host);
  document.append(host);
  start();
  const changed = vi.fn(),
    stop = registry.subscribe(changed);
  host.isConnected = false;
  expect(registry.roots()).toHaveLength(1);
  expect(changed).toHaveBeenCalledOnce();
  expect(observer.disconnect).toHaveBeenCalled();
  stop();
});
it("explicit inspection discovers roots attached later to an existing host", () => {
  const host = new Tree();
  document.append(host);
  start();
  shadow(host);
  registry.refresh();
  expect(registry.roots()).toHaveLength(2);
  expect(document.scans).toBe(2);
});
it("explicit inspection discovers roots attached inside an existing shadow root", () => {
  const host = new Tree(),
    nested = new Tree();
  document.append(host);
  const outer = shadow(host);
  outer.append(nested);
  start();
  shadow(nested);
  registry.refresh();
  expect(registry.roots()).toHaveLength(3);
  expect(document.scans).toBe(2);
  expect(outer.scans).toBe(2);
});
it("ignores Fontzie overlay subtrees", () => {
  start();
  const overlay = new Tree();
  overlay.ui = true;
  shadow(overlay);
  observer.queue.push(added(overlay));
  expect(registry.roots()).toHaveLength(1);
  expect(overlay.scans).toBe(0);
});

it("discovers roots in large sibling batches with bounded traversal work", () => {
  start();
  const container = new Tree();
  document.append(container);
  const siblings = Array.from({ length: 2000 }, () => new Tree());
  container.append(...siblings);
  shadow(siblings.at(-1)!);
  traversalWork = 0;
  observer.queue.push({ addedNodes: siblings } as unknown as MutationRecord);

  expect(registry.roots()).toHaveLength(2);
  expect(siblings.every((node) => node.scans === 1)).toBe(true);
  expect(traversalWork).toBeLessThan(siblings.length * 3);
  expect(document.scans).toBe(1);
});
