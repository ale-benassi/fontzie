import { onMounted, ref, shallowRef } from "vue";
import { catalog, loadCatalog } from "../providers/catalog";
import { errorMessage } from "../core/errors";

const fonts = shallowRef([...catalog]);
const loading = ref(false);
const error = ref("");
let pending: Promise<void> | undefined;
function reload() {
  if (pending) return pending;
  loading.value = true;
  error.value = "";
  pending = loadCatalog()
    .then(() => {
      fonts.value = [...catalog];
    })
    .catch((value: unknown) => {
      error.value = errorMessage(value);
    })
    .finally(() => {
      loading.value = false;
      pending = undefined;
    });
  return pending;
}

export function useCatalog() {
  onMounted(reload);
  return { fonts, loading, error, reload };
}
