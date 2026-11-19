// Chrome also runs this function directly in the top frame's isolated world.
// After an extension reload the page can retain an editor without its controller.
export function dismissFloatingEditor() {
  const controller = (
    globalThis as typeof globalThis & { __fontzieFloating?: { hide(): void } }
  ).__fontzieFloating;
  controller?.hide();
  for (const shell of document.querySelectorAll(
    ':root > fontzie-editor[data-fontzie-ui][popover="manual"]',
  ))
    shell.remove();
}
