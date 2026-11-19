# Fontzie architecture

WXT builds a Manifest V3 Chrome extension with a Vue 3 Composition API editor. The side panel and floating editor use the same bundled application.

## Modules

- `entrypoints/sidepanel`: application entry, shared tooltip provider and Tailwind v4 tokens.
- `components`: targets, font browsing, typography, presets, export and settings. `components/ui` contains the shared shadcn-vue/Reka UI controls.
- `composables/useFontzie.ts`: configuration transactions, target editing and operation ownership. `useConfigHistory` owns applied snapshots and input grouping. Page and target generations prevent obsolete work from updating a different editor context.
- `composables/useTabConnection.ts`: window/tab connection, permissions and listener cleanup. Other composables own appearance, fonts, presets, backup, reset and floating position.
- `entrypoints/background.ts`: validated message routing and Chrome action/side-panel setup.
- `background/session.ts`: injection, frame identity, navigation and draft restoration.
- `background/panel.ts`: serialized page commands and configuration updates inside each tab's queue.
- `background/library.ts`: custom-font reconciliation and local-data reset. Reconciliation reads current configuration inside the tab queue.
- `background/styles.ts`: user-origin CSS ownership. `background/floating.ts` manages the floating host.
- `content`: isolated-world inspection, exact handles, highlighting, root discovery and shadow-root styling.
- `core`: versioned schemas, typed messages, selectors, CSS generation, history and font identity/capabilities.
- `providers`: catalog lookup, font delivery, decoding and bounded caches. `catalogs` contains bundled metadata and provenance.
- `storage`: Chrome Local/Session persistence, mutation queues and the custom-font database.
- `playground`, `tests`: real page fixtures, logic tests and unpacked-extension browser workflows.

## Commands and ownership

Panel and content commands use validated message schemas. The background addresses an explicit tab/frame, injects the bundled inspector into eligible documents and serializes edits. CSS requests can affect only their sender's tab, frame and document. Frame identity stays internal to each rule; all its targets share that document. The element picker selects the target document automatically, without a manual frame chooser in the editor.

The picker follows the pointer's event target. Generated target labels may contain CSS child combinators (`>`); selector validation accepts these alongside hand-entered child selectors while continuing to reject markup and style blocks. If the pointer is outside that element's own client rectangles (for example, a button with a stretched pseudo-element covering a card), it chooses the first underlying page element whose rectangles contain the pointer. Each lookup stays in its document or shadow root, descends into a candidate's open shadow roots and excludes Fontzie UI. A host remains selectable when its shadow root has no eligible candidate; if the initial lookup has none, the original target remains selectable.

The editor retains the owner of each asynchronous operation. A tab, frame or target change invalidates obsolete updates and delayed input. Successful edits refresh inspected computed typography. Completing a selector operation preserves newer draft text. History advances after a successful apply.

User-facing failures pass through `core/errors.ts`, including custom-font and preset dialogs. It translates Chrome connection/page errors, invalid selectors, download failures, storage limits and native exceptions into readable recovery guidance, including errors transported as strings by the worker. Preserve specific application guidance instead of displaying browser internals, frame IDs or validation issue dumps.

## Styling and fonts

CSS exports keep the original selector for a single target. When rules overlap, native CSS nesting gives them the same specificity so their order matches the editor. Fontshare imports use the variable face for intermediate weights and retain the chosen weight in the declaration. AI prompt exports share the font setup and list each rule’s properties once. The panel resolves exact picks in their owning frame when building the prompt. The inspector checks the original element against a unique selector in its root and identifies each shadow host. An unavailable or ambiguous pick carries a selector hint and a request for confirmation. The prompt omits temporary handles and picked page text.

Removable USER-origin CSS applies ordinary document rules. Open shadow roots receive removable constructed stylesheets. Document identity prevents styles from crossing navigation. Shared root discovery handles inserted subtrees and prunes disconnected roots. Explicit target inspection refreshes discovery immediately. Computed typography refreshes reuse known roots and schedule one discovery scan per 500 ms window, preserving roots attached to existing hosts without adding a full scan to each edit. Match observers subscribe to newly discovered roots. Hover previews observe visibility and render at most 100 visible overlays, reading geometry before changing styles. Inspected elements use weak references so removed page subtrees can be collected; exact handles still follow the original element through temporary removal and reinsertion.

Catalog JSON is packaged locally and indexed by family ID. The Fontshare catalog accepts only families marked `sil_ofl`. When restoring a preset, page draft or backup, an unavailable Fontshare family loses its family override, axes and synthesis setting. Other typography values stay on the rule, and the editor names the missing family. The editor mounts before catalog loading finishes; `useCatalog` shares loading, retry and reactive metadata readiness. Settings, preset and export dialogs load on first use and retain their normal closing/focus lifecycle. Reset confirmations mount when opened so their portals stay above previously loaded dialogs. UI font files and their stylesheet are packaged under `public/fonts` and linked from the extension origin in both development and production.

Provider downloads return font bytes for local decoding; remote executable code is never loaded. Font requests contain family, weight and style rather than inspected page text. Worker delivery keys include the supported variable weight range, so weights sharing a remote file reuse one delivery. Completed client requests can cover other weights only when every returned subset supports that weight and style; custom requests keep exact weight identity to preserve families mixing static and variable files. Rule font batches load with at most three concurrent requests; failures wait for started work before rollback or resource release. Browser specimen requests share three slots across scrolling generations and retries, skipping obsolete queued previews.

Custom fonts retain per-face weights, styles and axes. Custom file editing uses a local metadata draft; only Save changes writes it and reconciles dependent rules. When a face becomes unavailable, its rules inherit the page’s font family. Their targets, order, enabled state and other typography edits survive, including in restored page drafts. The editor updates in place and removes unavailable face references from undo and redo history. Cancel and closing the file-details dialog discard the draft. The browser owns the selected family and restores focus to its gear when the dialog closes, including in All and collection views. After an import, refresh the library even if a later file in the batch fails, so successfully saved files remain available in the browser. Reset file inputs after selection so the same file can be retried. Collision-free aliases identify custom families. A local revision invalidates replaced font bytes. Visible specimens and rules retain faces; unused faces enter a bounded cache and can be evicted.

## Storage and restoration

Chrome Local stores settings, favorites, recents, presets and page drafts. Page keys include origin, path and query. Chrome Session stores active tab/frame ownership. IndexedDB stores custom font metadata separately from file bytes.

Each edited tab has an index of the frames with saved USER styles. Closing a tab reads its index and removes its records. A missing child frame triggers a fresh check of the accessible frames. Rules tied to a departed frame pause while edits in surviving frames continue.

Backups use compact JSON. Both download and import check the same 64 MB limit, including for older indented files. An imported embedded rule requires a unique frame URL. Missing or ambiguous frames and imported exact picks remain paused. A combined import checks preset capacity first and restores the previous page edits if the library write fails. After import, the editor selects the first restored rule.

Drafts retain applied rules, ordering, enabled states, Preview state and the active rule ID. Rule selection is remembered through the background tab queue when the active rule changes, including when no typography changes. Ordinary edits save the updated draft without another selection save. Reconnection restores that rule and inspects its current targets together; unrelated inspection data never becomes a pending editor target. Older drafts or deleted active IDs fall back to a matching rule or the first saved rule. Blank and untargeted active rules remain selected with empty targets. Durable exact targets retain selectors rather than document handles. Restoration rebinds a pick only when it resolves uniquely; missing or ambiguous targets pause. Reconnects in the same document preserve frame identity, including frames sharing a URL. The editor summarizes restore warnings in one dismissible alert, counting current paused rules with unresolved exact targets or unavailable frames. It hides stale warnings when those rules are repaired or removed, and never displays raw selectors in the notice.

Restoration after reload or browser restart requires existing site access. Temporary activeTab access can require another toolbar click. Reset writes an empty draft or removes the relevant site's drafts. Clear local data removes stored settings, drafts, presets and custom files.

## Floating editor

The floating shell uses a manual popover and a closed shadow root containing an extension-origin editor iframe. Embedded commands are bound to the containing tab. The shell validates geometry/readiness messages against the iframe origin, window and instance token. Local storage retains geometry; session storage tracks the open editor.

During a mode change the worker transfers Undo and Redo to the destination editor for the same tab, URL and document token. The receiving editor also compares the current configuration before accepting that history.

Closing or docking removes Fontzie’s floating shells from the top document, including any shell left by an earlier extension version. An open shell also dismisses itself when Chrome invalidates the extension during an update. The embedded iframe delegates clipboard writes for Copy. When a website blocks copying, the editor selects the export for keyboard copying.

## Development and verification

`npm run verify` checks formatting, lint and types, runs unit tests, builds the extension and runs local browser checks. `npm run lint` checks handwritten JavaScript, TypeScript and Vue through `eslint.config.mjs`; Prettier owns formatting. `npm run test:providers` checks real Google and Fontshare delivery. CI uses the same verification commands. Local browser checks follow [AGENTS.md](../AGENTS.md).

Browser tests use temporary extension copies and profiles. Only fixture copies receive localhost access and deterministic provider responses. Actual inspection, storage, CSS, decoding and editor messages use Chrome extension APIs. Restart tests reuse one test profile across their phases. Screenshots and results are generated test outputs excluded from Git.
