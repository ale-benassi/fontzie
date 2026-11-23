# Privacy, security and performance

Fontzie is local-first. No telemetry, backend, account or cloud synchronization. Chrome Local stores preferences, automatically saved page edits and reusable configurations; Chrome Session holds active tab/frame/document ownership; IndexedDB stores custom files. Picking an element reads its selector, dimensions and typography without copying its text into the editor. Automatic drafts store the edited page URL, rules and selection selector/frame URL; they omit inspected text, DOM handles and tab IDs and stay on this device. Provider requests contain font family/style/axes, never selected text. Custom bytes are messaged only between this extension’s own worker and permitted content scripts.

## Boundaries

Messages use a namespaced discriminated schema and runtime validation. Editor commands require the extension-owned sidepanel document; an embedded editor is bound to its sender tab. Website messages cannot issue editor commands. The floating shell accepts only geometry, minimize and readiness messages from its own iframe window, extension origin and per-instance token; it validates numeric deltas. No page text or rules are sent through postMessage. Content CSS requests target their sender frame/document, never an arbitrary supplied tab ID. Selectors, properties, units, features and axes are bounded and validated. Import JSON is limited to 2 MB/200 rules. Font signatures and decode checks protect custom ingestion (20 MB per face); fonts are parsed locally. Delivery permits HTTPS URLs on Google’s or Fontshare’s exact CDN hostnames. No remote code, eval or page security changes are needed.

Clicking the toolbar icon grants temporary access through Chrome’s activeTab permission. In Fontzie’s Settings, **Always allow this site** asks for access to the connected site. **Connect automatically on all websites** asks for access to all HTTP and HTTPS websites. These permissions let Fontzie inspect pages and restore saved edits automatically. Use **Manage site access in Chrome** to change the broad permission later. Chrome manages consent and individual site grants. Fixed font-provider hosts are the only default host permissions. USER-origin removable styles avoid mutation of original inline declarations; document IDs prevent CSS ownership from leaking across navigation.

In Incognito, the editor uses Chrome’s offscreen permission to read the system color scheme outside the dark browser window. The bundled document sends only a light or dark preference to the editor and closes when its last editor disconnects.

Installed fonts require Chrome's Local Font Access permission. The first request opens a Fontzie setup tab because the side panel cannot display that prompt. After approval, validated family/style metadata is shared through Chrome Session for this browser session and restored only while permission remains granted. Revoking access clears the list. Font bytes are not read or stored by this discovery flow.

The floating editor reuses the bundled sidepanel document in an extension-origin iframe inside an isolated shadow root. Only sidepanel.html is exposed as a web-accessible resource. Browser extension CSP and website permissions remain in force; no website CSP is changed. If the iframe cannot connect, the sidebar remains available with an error.

## Performance choices

Catalogs are local snapshots loaded after the editor mounts. Search filters around two thousand metadata records; the font list renders its visible rows and a small overscan. Fontkit loads as a dynamic chunk when a file is imported. UI fonts are packaged as local WOFF2 files and loaded from the extension origin, including during development.

Provider deliveries use a 32-entry least-recently-used worker cache. Variable weights sharing a remote file reuse its delivery; completed client requests reuse all decoded subsets only within their common supported weight range and style. Custom requests retain exact weight identity and revision invalidation. Idle decoded faces are bounded to 24 families and 16 MB; request records are bounded to 256. Applied rules and visible specimens retain the faces they need. Independent rule fonts and browser specimens load in batches with at most three concurrent requests. Failed downloads preserve the previous configuration.

Styling stays serial per tab and per frame. Dynamic selector matches use CSS. Root discovery scans inserted subtrees, prunes disconnected roots and refreshes immediately for explicit inspection. Routine computed-value refreshes coalesce full discovery within 500 ms windows. Highlight rendering is limited to 100 visible matches, while selection counts and applied rules still cover every match. Geometry reads precede overlay writes. Picker listeners exist only while selecting. Weak inspection references allow detached page elements to be collected. Page teardown disposes listeners, sheets and owned FontFace objects. History retains at most 80 snapshots.

## Browser and delivery limits

The extension requests fixed access to Google’s stylesheet and font hosts and Fontshare’s font CDN. Fontshare’s stylesheet API appears in exported code for the destination website.

Closed shadow roots, browser pages, the Web Store, browser-managed PDF views and frames without permission cannot be inspected. Inline important declarations inside an open shadow root can outrank its constructed stylesheet. Exact picks do not follow framework replacement elements; restoration requires a unique selector match.

Provider font downloads require network access. Dense variable CJK fonts can require substantial downloads because requests never send page text for subsetting. Native permission prompts and Chrome policy govern access. The browser tests exercise supported workflows; they do not establish an exhaustive security assessment or Chrome Web Store approval.
