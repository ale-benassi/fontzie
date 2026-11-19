# Fontzie coding standards

Use these standards for new code and changes to existing code. Follow the surrounding conventions and improve the part you are changing. Keep unrelated refactors and formatting out of the patch.

[Product](../PRODUCT.md) defines supported behavior, [Design](../DESIGN.md) owns visual decisions, [Architecture](architecture.md) describes module responsibilities, and [Privacy](privacy.md) describes data and browser boundaries. The development and installed-Chrome verification workflow lives in [AGENTS.md](../AGENTS.md) and the [README](../README.md#development-in-your-existing-chrome-profile).

## Formatting and naming

- Use the existing Prettier installation and its defaults. The repo has no custom Prettier configuration. It currently produces two-space indentation, double quotes, semicolons and trailing commas in TypeScript and Vue scripts.
- `npm run format:check` and `npm run format` cover TypeScript/Vue files in the source and test directories listed in `package.json`, root TypeScript files, `eslint.config.mjs`, `scripts/update-catalogs.mjs` and workflow YAML. CSS, Markdown and other scripts are outside that command's coverage. Review their formatting and follow the surrounding file. Respect `.prettierignore`.
- Format only files involved in the change while working; the full `format` command writes across its configured scope. For example, `npx prettier --write components/NumberField.vue` formats one component.
- Use PascalCase for Vue component files, `useName.ts` for composables, and the existing kebab-case style for other TypeScript modules and tests. Use camelCase for values/functions and PascalCase for types. Prefer names that identify the owner or operation, such as `targetFrame` or `connectionGeneration`.
- Keep imports explicit and near the top. Use `import type` or inline `type` imports for type-only dependencies. Existing code uses relative module imports and `@/` imports for shared controls; follow the nearby convention. There is no enforced import sorting rule.
- Explain ownership, browser constraints and reasons for unusual code in comments. Extract helpers when they give a responsibility a clear name or remove meaningful duplication; choose boundaries by responsibility rather than file or function length.

## TypeScript and validation

- Keep `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals` and `noUnusedParameters` enabled in [tsconfig.json](../tsconfig.json). Handle missing array entries and optional fields deliberately.
- Reuse the domain types and Zod schemas in [core/schema.ts](../core/schema.ts), message schemas in [core/messages.ts](../core/messages.ts), and existing selector/font helpers. Infer types from schemas where those schemas own the contract.
- Treat incoming messages, parsed JSON, stored data and provider responses as untrusted at their boundary. Start with `unknown` where the value is untyped, validate or narrow it, then work with the result. A type assertion does not validate data.
- Extend the owning schema/helper when a contract changes. Keep validation at each trust boundary, and reuse its rules rather than adding competing component-level definitions. UI feedback may preview validity, but the receiving boundary still validates.
- Avoid `any`, non-null assertions and casts used only to silence the compiler. A necessary assertion should follow a visible guard or have a short explanation of the invariant or API limitation. Do not weaken compiler settings to accommodate a change.
- Keep serialized data compatible with Chrome messaging/storage and existing versioned import/export formats. Add migration handling when persisted formats change; preserve existing user data and test the migration.

## Components, composables and state

- Use Vue Composition API with `<script setup lang="ts">` in components. Declare typed props and emits. Props are inputs; emit user intent and let the owning component/composable update shared state.
- Keep components focused on presentation, local interaction and drafts. Put reusable stateful behavior and lifecycle management in composables; put domain calculations and validation in `core`. Keep Chrome routing, page DOM work, providers and storage in their existing modules. See the [architecture module map](architecture.md#modules).
- Keep one owner for applied rules, connection state and history. [useFontzie](../composables/useFontzie.ts) owns editing transactions and delegates snapshots/grouping to `useConfigHistory`; [useTabConnection](../composables/useTabConnection.ts) owns connection lifecycle. The side panel and floating editor use the same application and editing logic.
- Distinguish local input drafts from successfully applied configuration. Use computed values for derived state and watchers for necessary synchronization or effects. Keep multi-step operations in named functions so templates remain readable.
- Pair listeners, timers, observers, object URLs, font retention and other resources with cleanup in the scope that creates them. Use Vue disposal/unmount hooks for UI scopes and the content lifecycle for page resources. Delayed work must respect disposal.
- Reuse `components/ui` controls and existing adapters such as `NumberField`, `ValueSlider`, `Disclosure` and `ConfirmAction`. Shared DialogContent owns dialog framing, title, close control and scrolling. Review shadcn-vue registry updates as changes to project-owned source, retaining Fontzie's behavior and styling.

## Async work and errors

- Capture the tab/page/frame/target that owns an operation before awaiting. After asynchronous work, verify that owner is still current before updating state, errors, status or busy flags. Preserve the generation checks in `useFontzie` and `useTabConnection`; obsolete responses must not update a newly selected tab or target.
- Preserve newer typed drafts when an older selector operation completes. Delayed slider/input work must not apply to a different rule or frame after selection changes.
- Serialize dependent edits through the existing queues. Background page mutations use the tab queue in [background/panel.ts](../background/panel.ts); settings/preset mutations share the worker queue in [storage/mutations.ts](../storage/mutations.ts). Read the latest configuration inside the queue before modifying it. Avoid queueing behind yourself from inside that same queue.
- Await successful application before advancing applied editor state and history. Preserve rollback and the previous working configuration on failed application or font delivery. A failed queued operation must allow later work to proceed.
- Await operations whose completion affects the next step. For deliberate fire-and-forget work, use `void` and handle rejection in the called function or at the call site. `void` alone does not handle failure.
- Report actionable user-facing failures through the existing error path, including [errorMessage](../core/errors.ts). Keep raw validation internals out of UI messages. Catch-and-ignore is appropriate for expected teardown, obsolete work or best-effort cleanup; make the reason clear when it is not evident. Do not silently swallow a failed user edit.
- Keep network requests bounded by timeouts and caches bounded by an explicit policy. Reuse provider delivery and font retention rather than introducing another fetch/cache path per control.

## Extension boundaries and local data

- Keep privileged routing in [entrypoints/background.ts](../entrypoints/background.ts) and background services. Use namespaced, validated messages and the typed response helpers. Validate the sender as well as the payload; editor commands belong to the extension-owned sidepanel document, and an embedded editor is bound to its containing tab.
- Derive content CSS ownership from the sender's tab, frame and document. Keep navigation/document identity checks in place. The floating shell's messages must retain source-window, extension-origin, instance-token and numeric validation; keep page text and rules out of its `postMessage` channel.
- Preserve `activeTab` as temporary website access and request optional origin access through the existing explicit user action. Handle denial and restricted documents with clear feedback. Review manifest, CSP, host grants and web-accessible resource changes against the [privacy boundaries](privacy.md#boundaries).
- Generate CSS through the existing validated properties, selector/target helpers and quoting functions. Preserve removable USER-origin document styles, constructed stylesheets for open shadow roots and cleanup on navigation. Do not overwrite original site inline styles or relax website security policy.
- Preserve frame identity even when frames share a URL. Exact targets refer to DOM identity in the current document; durable saves retain selectors through [durableConfig](../core/persistence.ts). Rebind only a unique match on restoration and pause missing or ambiguous exact targets. Reusable selectors continue to support dynamic matches. Closed shadow roots and ungranted frames remain browser boundaries.
- Keep preferences, presets and drafts in Chrome Local, active ownership in Chrome Session, and custom font metadata/bytes in their IndexedDB stores. Route shared settings/preset writes through the existing mutation API so multiple editor instances cannot overwrite one another's updates.
- Keep custom font parsing and files local, retain signature/size/decode checks, and invalidate retained faces when bytes are replaced. Preserve transactional metadata/byte writes in [storage/fonts.ts](../storage/fonts.ts).
- Provider delivery uses the existing HTTPS host allowlist and requests without credentials or referrers. Keep inspected text and custom bytes out of provider requests and logs. Preserve the product's lack of telemetry, backend and cloud sync; load executable code from the extension bundle.

## Styling and accessibility

- Follow [DESIGN.md](../DESIGN.md) and reuse the tokens in [sidepanel/style.css](../entrypoints/sidepanel/style.css), radius definitions in [core/ui-radii.ts](../core/ui-radii.ts), and shared control styling in [components/ui/controls.css](../components/ui/controls.css). Change a shared token or control at its owner rather than repeating overrides in each feature.
- Feature CSS should describe layout or a distinct role. Use existing semantic control variants, sizes and the Lucide/Icon foundation. Preserve local Inter/JetBrains Mono interface fonts and keep specimens styled with the font being previewed.
- Retain necessary site-isolation styles for injected overlays and the floating shell, and accessibility priority for reduced motion. `!important` has legitimate uses here; a new use should have a clear isolation, cascade or accessibility reason.
- Use semantic controls, associated labels and accessible names for icon actions. Preserve keyboard operation, visible focus, focus restoration, dialog behavior and disabled/busy states. Hidden or inactive controls must not remain keyboard targets.
- Check affected UI in Light and Dark at 320, 390 and 420px, plus System behavior when appearance logic changes. Check pointer and keyboard interaction, overflow and reduced motion where relevant. Coordinate workspace motion through CardStack; keep focus stable and respect the existing reduced-motion path.

## Tests and verification

Choose checks for the behavior and files changed. Documentation-only edits need link, command and diff review; they do not need a build or browser reload. Cosmetic or reversible low-impact edits do not automatically need new tests.

| Check                    | Existing coverage and limits                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`   | Prettier for the file patterns in `package.json`; excludes paths in `.prettierignore`.                                                                                    |
| `npm run lint`           | ESLint correctness checks across handwritten JS/TS/Vue, including scripts and tests. Warnings fail the command.                                                           |
| `npm run lint:fix`       | Runs the same lint checks with available automatic fixes. Review the resulting diff; some findings need manual fixes.                                                     |
| `npm run typecheck`      | Vue/TypeScript checking using `tsconfig.json` and WXT's generated types.                                                                                                  |
| `npm test`               | Vitest logic/regression tests under `tests/unit`. A focused run is `npm test -- tests/unit/messages.test.ts`.                                                             |
| `npm run build`          | Production WXT bundle; `prebuild` also regenerates dependency notices. Shares output with dev.                                                                            |
| `npm run test:e2e`       | Builds first, then runs the Playwright local project with deterministic provider fixtures in temporary extension copies/profiles.                                         |
| `npm run test:providers` | Builds first, then runs the separate live-provider project.                                                                                                               |
| `npm run verify`         | Formatting, lint, types, unit tests and `test:e2e`, including its production build. CI runs the same checks with one shared build and three browser shards. Live providers are opt-in for manual CI runs. |

### Automatic linting

[eslint.config.mjs](../eslint.config.mjs) is the source of truth for lint rules. The flat configuration combines ESLint's recommended JavaScript rules, typescript-eslint's recommended rules and Vue 3's essential correctness rules. It follows the official [Vue configuration guide](https://eslint.vuejs.org/user-guide/) and [typed-linting guidance](https://typescript-eslint.io/getting-started/typed-linting/). [eslint-config-prettier](https://github.com/prettier/eslint-config-prettier) disables conflicting formatting rules.

- All handwritten `.js`, `.mjs`, `.cjs`, `.ts` and `.vue` files are in scope. Generated WXT/build output, test reports/screenshots, `node_modules` and `output` artifacts are ignored. CSS, generated font assets and Markdown are outside ESLint's scope.
- JavaScript rules reject `eval` and dynamic `Function` construction; type-aware checks also reject string-based timer callbacks. TypeScript rules reject explicit `any`, unused values and several unsafe syntax patterns. Type-only imports are enforced; inline `import()` type annotations remain supported. Compiler checks still own type correctness and undeclared TypeScript identifiers.
- Vue essential rules catch invalid directives/templates, duplicate keys, prop mutation and side effects in computed properties. Single-word component names remain allowed for the project's controls and components.
- Type-aware checks reject `await` on non-promises, unmarked floating promises, and promise misuse in conditions/spreads and other checked positions. Async callback arguments and Vue attributes are allowed because Chrome/Vue handlers commonly return promises; rejection handling in those callbacks still needs review. Explicit `void` marks deliberate fire-and-forget work, but does not prove its rejection is handled.
- Empty catches remain allowed for best-effort cleanup and obsolete work. Unused catch parameters, underscore-prefixed callback parameters and omitted fields in rest destructuring are allowed. Their meaning still needs review. A fixture that exposes its fake observer instance has one explained, line-level exception to `no-this-alias`.
- New exceptions must be narrow and explain the invariant or API limitation. Unused disable comments fail lint. Keep handwritten application code in scope; fix findings rather than adding file-wide disables.

Naming, module boundaries, operation ownership across awaits, runtime boundary validation, privacy, CSS, accessibility and visual design still require review and behavior checks. There is no stylelint setup. Passing lint does not establish those properties by itself.

Verify extension changes in the unpacked copy in Chrome. The [development guide](../README.md#development-in-your-existing-chrome-profile) covers automatic refresh, switching builds and running the browser suite. Coding agents follow [AGENTS.md](../AGENTS.md) for browser verification.

- Add focused regression tests for changed logic and bugs where behavior can regress. Prefer observable outcomes: applied CSS, saved/restored data, history, feedback and operation ownership. Use deferred promises to exercise stale completions, rapid edits, failure recovery and tab/frame changes when touching async behavior.
- Use unit tests for schemas, helpers, storage mutations and composables; use existing page fixtures/browser workflows for Chrome API, DOM, frame, shadow-root and interaction behavior when authorized. Keep mocks at boundaries and preserve cleanup between tests.
- Keep deterministic provider adapters and extra localhost grants confined to temporary test copies. Preserve live-provider checks as a separate concern and retain font fixture provenance/licenses.
- Wait for observable state rather than arbitrary sleeps. Use accessible locators where practical. Fix blocked interactions and pointer overlaps; do not force-click or use DOM-triggered clicks to bypass the behavior under test.
- Align visual expectations with approved tokens and behavior. Update expectations for an intended design change after checking the visible result; retain assertions that detect regressions.

## Generated assets and dependencies

Use Node 24 from `.node-version` and npm with the committed `package-lock.json`. The minimum Node version is 22.13 for ESLint 10. Review dependency changes for browser/MV3 compatibility, bundle impact, licenses and required permissions; keep them focused and update the lockfile with package changes.

The scoped `minimatch` overrides for ESLint, its config-array helper and typescript-estree keep the new lint dependency tree on 11.0.4 or newer to address [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). Remove them once upstream dependency ranges include a patched release, then rerun lint and the dependency audit.

| Source of truth                                                                  | Regeneration and review                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `public/branding/fontzie-mark.svg` and `scripts/generate-icons.mjs`              | `npm run icons:generate` updates the badge SVG, hashed 16/32/48/128px PNGs and panel favicon, removing superseded PNGs. Commit those outputs together. Toolbar verification requires the full reload described in AGENTS/README.                                         |
| Fontsource Inter and JetBrains Mono packages and `scripts/generate-ui-fonts.mjs` | `npm run fonts:generate` regenerates `public/fonts/ui-fonts.css` and its packaged WOFF2 files. Preserve weights, Unicode ranges and packaged font licenses.                                                                                                                                  |
| Provider sources and `scripts/update-catalogs.mjs`                               | Pin the Fontsource source with `FONTSOURCE_REF=<commit> npm run catalog:update`. Review both catalog JSON files and `catalogs/provenance.json`; preserve hashes, source attribution and provider license metadata. The updater also fetches Fontshare's current catalog. |
| Installed dependency licenses and `scripts/licenses.mjs`                         | `node scripts/licenses.mjs` regenerates `public/licenses/THIRD-PARTY.txt`; build/zip run it automatically. Keep `public/licenses/shadcn-vue.txt` for the source-owned controls.                                                                                          |

Review generator changes together with their outputs; regenerate rather than hand-editing generated font assets or hashed icons. Keep `.output`, `.wxt`, `node_modules` and generated test reports/screenshots out of commits, following `.gitignore`.

## Changes and review

- Inspect the working tree first and preserve unrelated or concurrent edits. Keep the patch focused on the requested behavior; avoid repo-wide formatting, new abstractions or new tooling without a concrete need.
- Update the relevant product, design, architecture or privacy document when its contract changes. Keep coding guidance here and link to it from other documents.
- Review the diff for generated artifacts, dependencies, permissions, data compatibility and unintended UI changes. Report what changed, the checks actually run and any remaining limitations. Do not claim an unrun check passed.
- In commits and pull requests, explain what changed, why and how you checked it. Review CI results and automated feedback on the latest commit.
