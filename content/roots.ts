type SearchRoot = Document | ShadowRoot;

// One registry serves inspection, match counts, highlights and shadow styling.
// Ordinary mutations only scan their inserted subtrees, never the whole page.
export class RootRegistry {
  private known = new Set<SearchRoot>();
  private listeners = new Set<() => void>();
  private observer: MutationObserver;
  private disposed = false;

  constructor(private document: Document) {
    this.observer = new MutationObserver((records) => this.process(records));
    this.known.add(document);
    this.observe(document);
    this.discover(document);
  }
  private observe(root: SearchRoot) {
    this.observer.observe(root, { childList: true, subtree: true });
  }
  private discover(node: ParentNode & Node): boolean {
    if (node.nodeType === 1 && (node as Element).closest("[data-fontzie-ui]"))
      return false;
    const elements =
      node.nodeType === 1
        ? [node as Element, ...node.querySelectorAll("*")]
        : [...node.querySelectorAll("*")];
    let changed = false;
    for (const element of elements) {
      const root = element.shadowRoot;
      if (!root || this.known.has(root) || element.closest("[data-fontzie-ui]"))
        continue;
      this.known.add(root);
      this.observe(root);
      this.discover(root);
      changed = true;
    }
    return changed;
  }
  private prune() {
    let changed = false;
    for (const root of this.known)
      if (root !== this.document && !(root as ShadowRoot).host.isConnected) {
        this.known.delete(root);
        changed = true;
      }
    if (changed) {
      this.observer.disconnect();
      for (const root of this.known) this.observe(root);
    }
    return changed;
  }
  private process(records: MutationRecord[]) {
    if (this.disposed) return;
    const added = new Set<Element>();
    for (const record of records)
      for (const node of record.addedNodes)
        if (node.nodeType === 1 && node.isConnected) added.add(node as Element);
    let changed = this.prune();
    for (const element of added) {
      // Only added ancestors can make this scan redundant. Walking upward
      // avoids comparing every pair when a page inserts thousands of siblings.
      let ancestor = element.parentElement;
      while (ancestor && !added.has(ancestor))
        ancestor = ancestor.parentElement;
      if (ancestor) continue;
      changed = this.discover(element) || changed;
    }
    if (changed) for (const listener of this.listeners) listener();
  }
  roots(): SearchRoot[] {
    this.process(this.observer.takeRecords());
    return [...this.known];
  }
  refresh() {
    this.process(this.observer.takeRecords());
    let changed = false;
    for (const root of [...this.known])
      changed = this.discover(root) || changed;
    if (changed) for (const listener of this.listeners) listener();
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.known.clear();
    this.listeners.clear();
  }
}
let registry: RootRegistry | undefined;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const current = () => (registry ??= new RootRegistry(document));
export const roots = () => current().roots();
// Explicit inspection also finds shadow roots attached to an existing host;
// attachShadow itself does not produce a document mutation.
export function refreshRoots() {
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  if (registry) registry.refresh();
  else current();
}
// Typography refreshes use the known roots immediately. A single deferred scan
// still finds roots attached to existing hosts without a child-list mutation.
export function scheduleRootRefresh() {
  if (refreshTimer !== undefined) return;
  refreshTimer = setTimeout(refreshRoots, 500);
}
export const watchRoots = (listener: () => void) =>
  current().subscribe(listener);
export function disposeRoots() {
  clearTimeout(refreshTimer);
  refreshTimer = undefined;
  registry?.dispose();
  registry = undefined;
}
