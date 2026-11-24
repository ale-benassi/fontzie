# Fontzie

Fontzie is a local-first Chrome extension for designers and frontend developers experimenting with typography on real websites.

## Workflow

Pick an element or enter a CSS selector, try font families and typography settings, save page edits or named presets, and export CSS, Tailwind v4 or a prompt for a coding assistant. The side panel and floating editor share the same editing interface. The active website is the live specimen.

## Platform and stack

WXT, Manifest V3, Vue 3 Composition API, TypeScript and Tailwind CSS v4. Chrome Storage retains settings and configurations; IndexedDB stores custom font files. Vitest covers logic and Playwright exercises the unpacked extension in Chromium.

## Capabilities

- Google Fonts, 36 Fontshare families under the SIL Open Font License, system stacks, optional installed fonts and uploaded font files.
- Hover, focus or tap the Fontshare tab for a tooltip explaining the open-source selection and how to use other families through Custom or Local. When a name search in All or Fontshare has no matches, users can add a font file or look for an installed copy.
- Independent rules containing exact picks, CSS selectors or both, including supported frames and open shadow roots.
- Select specific rules or all rules, including hidden and untargeted rules. Edit the checked rules with the shared Font family and Typography controls, or delete them after confirmation. Each edit supports a single Undo.
- Supported weights, styles and variable axes; numeric typography controls, original comparison and undo/redo.
- Changing the font family preserves each checked rule's supported weight and style and clears axes from its previous family.
- Automatic page drafts, named presets and JSON backup.
- AI prompts include the reference page, target scope, exact typography values and font setup. If a picked element cannot be identified uniquely, the prompt asks the assistant to confirm the target.
- The library holds up to 100 named presets. Saving or importing beyond that limit asks the user to make room. Moving between the side panel and floating editor carries Undo and Redo for the current page.
- The toolbar icon grants temporary access to the active website. Settings offers ongoing access to the connected site or an opt-in for all HTTP and HTTPS websites. Both require Chrome’s permission and let saved edits restore automatically.
- Light, Dark and System themes in a compact inspector layout.

## Principles

Keep editing fast, precise and approachable. Use progressive disclosure and familiar browser controls. Preserve keyboard access, visible focus, readable contrast, reduced motion and narrow-panel support.

Use the supplied vector wordmark and a monochrome interface with Inter for UI and JetBrains Mono for technical values. See [Design](DESIGN.md).

## Privacy and boundaries

Fontzie has no backend, account, analytics or cloud synchronization. Custom files and inspected page text stay on the device. Downloading provider fonts contacts Google or Fontshare. Website access follows Chrome permissions; unsupported documents and inaccessible targets must produce clear feedback. See [Privacy](docs/privacy.md) and [Architecture](docs/architecture.md).
