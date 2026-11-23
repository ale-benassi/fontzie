# Fontzie workflow

Read and follow [Coding standards](docs/coding-standards.md) before changing code. Keep shared coding guidance in that document.

During ongoing extension UI work, use WXT's automatic development refresh:

- Start `npm run dev`, or reuse the existing Fontzie dev server. Keep it running between edits and follow-up requests; do not stop it or restore a production build at the end of each turn unless the user requests that switch.
- Both development and production use `.output/chrome-mv3` to retain the installed extension's identity and saved data. WXT's automatic browser runner must remain disabled, and the dev server must remain bound to loopback.
- When switching into development mode, reload Fontzie once in the user's actual Google Chrome, using the existing profile where it is installed. Then use automatic UI refresh for subsequent template, style and component edits, and verify the visible result there. Do not repeatedly visit `chrome://extensions` for ordinary UI edits.
- For routine visual and interaction checks, use the visible Fontzie side panel through the native macOS interface. Open a remote debugging connection only when a check needs DevTools, such as inspecting console errors or network requests. Reuse an existing approved connection when available and run related checks over that same connection.
- Background changes trigger WXT's full extension reload and may require reopening the panel. After a dev-server restart, manifest/configuration change or toolbar-icon change, reload manually when necessary and verify the current build is active.
- Run type checks and unit tests as appropriate. If a production build is needed, stop dev before `npm run build` because both modes share the output directory. Restore `npm run dev` and reload once afterward to continue UI work.

Before reporting an extension change complete, verify the user's actual installed Google Chrome has the latest code, through automatic refresh or a full reload as appropriate. Chrome for Testing or any other separate automated browser does not satisfy this requirement. Documentation-only changes do not require rebuilding or reloading the extension.

Do not launch Chrome for Testing or another separate browser for local verification, including through Playwright, `npm run test:e2e`, `npm run test:providers`, or `npm run verify`, unless the user explicitly requests a separate test browser. Use the user's actual Google Chrome for browser checks. Run build, type checks, and unit tests as appropriate; if an automated browser test requires a separate browser, leave it unrun and state that limitation.

## Small UI changes

Keep small UI changes focused on the requested behavior: read the relevant guidance, implement directly, run appropriate checks, and verify the affected interaction in installed Chrome. Avoid broad design workflows and repeated checks unless new evidence warrants them. Limit troubleshooting of browser verification blockers to one targeted retry or a simpler supported method, with five minutes total spent on the blocker. If verification remains blocked, finish unaffected work and report what passed and what remains unverified. Continue debugging beyond that limit only when evidence points to a regression caused by this change or the user requests the investigation; do not claim an unverified result works.

## Documentation ownership

Read the relevant current guide before editing and update it when its contract changes:

| Subject                                               | Owning document                              |
| ----------------------------------------------------- | -------------------------------------------- |
| Product behavior and confirmed decisions              | [PRODUCT.md](PRODUCT.md)                     |
| Visual design, tokens and interaction conventions     | [DESIGN.md](DESIGN.md)                       |
| Module boundaries, state/storage and runtime behavior | [Architecture](docs/architecture.md)         |
| Permissions, data handling and browser limits         | [Privacy](docs/privacy.md)                   |
| Coding conventions and test expectations              | [Coding standards](docs/coding-standards.md) |
| Setup, development commands and document index        | [README.md](README.md)                       |

Keep general rules and reading routes here; keep detailed procedures in the owning document. Preserve existing/concurrent work and keep dated task notes with their issue or chat assets.

## Work tracking

Use [GitHub Issues](https://github.com/ale-benassi/fontzie/issues) for public bug reports and feature requests.
