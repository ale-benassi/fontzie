import { computed, shallowRef, triggerRef } from "vue";
import { History, type HistorySnapshot } from "../core/history";
import { emptyConfig, type Config } from "../core/schema";

// Applied snapshots and input grouping have one owner. The editor advances
// undo/redo only after its page transaction has completed successfully.
export function useConfigHistory() {
  const history = shallowRef(new History<Config>(emptyConfig()));
  let lastGroup: string | undefined;
  let lastTime = 0;
  return {
    canUndo: computed(() => history.value.canUndo),
    canRedo: computed(() => history.value.canRedo),
    snapshot: () => history.value.snapshot(),
    reset(config: Config, snapshot?: HistorySnapshot<Config>) {
      history.value = new History(config, snapshot);
      lastGroup = undefined;
      lastTime = 0;
    },
    record(config: Config, group?: string) {
      history.value.commit(
        config,
        !!group && group === lastGroup && Date.now() - lastTime < 500,
      );
      lastGroup = group;
      lastTime = Date.now();
      triggerRef(history);
    },
    reconcile(update: (config: Config) => Config) {
      history.value.reconcile(update);
      triggerRef(history);
    },
    peekUndo: () => history.value.peekUndo(),
    peekRedo: () => history.value.peekRedo(),
    undo() {
      history.value.undo();
      triggerRef(history);
    },
    redo() {
      history.value.redo();
      triggerRef(history);
    },
  };
}
