import { nextTick } from "vue";
export async function openDetails(id: string, focusSelector?: string) {
  const el = document.getElementById(id);
  const trigger = el?.querySelector<HTMLButtonElement>(
    '[data-slot="collapsible-trigger"]',
  );
  if (!el || !trigger) return;
  if (trigger.getAttribute("aria-expanded") !== "true") trigger.click();
  await nextTick();
  // Nested collapsible content mounts after the root's update has flushed.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  el.querySelector<HTMLElement>(
    focusSelector ??
      '[data-slot="collapsible-content"] input:not([type="file"]),[data-slot="collapsible-content"] select,[data-slot="collapsible-content"] textarea,[data-slot="collapsible-content"] button',
  )?.focus({ preventScroll: true });
  el.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}
