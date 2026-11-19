export interface HistorySnapshot<T> {
  current: T;
  undo: T[];
  redo: T[];
}
export class History<T> {
  private undoItems: T[] = [];
  private redoItems: T[] = [];
  constructor(
    private current: T,
    snapshot?: HistorySnapshot<T>,
  ) {
    this.current = structuredClone(current);
    if (
      snapshot &&
      JSON.stringify(snapshot.current) === JSON.stringify(current)
    ) {
      this.undoItems = structuredClone(snapshot.undo);
      this.redoItems = structuredClone(snapshot.redo);
    }
  }
  snapshot(): HistorySnapshot<T> {
    return structuredClone({
      current: this.current,
      undo: this.undoItems,
      redo: this.redoItems,
    });
  }
  get canUndo() {
    return this.undoItems.length > 0;
  }
  get canRedo() {
    return this.redoItems.length > 0;
  }
  commit(next: T, merge = false) {
    if (JSON.stringify(next) === JSON.stringify(this.current)) return;
    if (!merge) this.undoItems.push(structuredClone(this.current));
    if (this.undoItems.length > 80) this.undoItems.shift();
    this.current = structuredClone(next);
    this.redoItems = [];
  }
  reconcile(update: (snapshot: T) => T) {
    this.current = update(this.current);
    const reconcileStack = (stack: T[]) => {
      let previous = this.current;
      const kept: T[] = [];
      for (const item of [...stack].reverse()) {
        const next = update(item);
        if (JSON.stringify(next) !== JSON.stringify(previous)) kept.push(next);
        previous = next;
      }
      return kept.reverse();
    };
    this.undoItems = reconcileStack(this.undoItems);
    this.redoItems = reconcileStack(this.redoItems);
  }
  peekUndo() {
    const value = this.undoItems.at(-1);
    return value === undefined ? undefined : structuredClone(value);
  }
  peekRedo() {
    const value = this.redoItems.at(-1);
    return value === undefined ? undefined : structuredClone(value);
  }
  undo() {
    const v = this.undoItems.pop();
    if (v === undefined) return;
    this.redoItems.push(this.current);
    this.current = v;
    return structuredClone(v);
  }
  redo() {
    const v = this.redoItems.pop();
    if (v === undefined) return;
    this.undoItems.push(this.current);
    this.current = v;
    return structuredClone(v);
  }
}
