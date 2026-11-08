# Architecture

[Русский](../architecture.md) | **English**

The app starts a local HTTP server and opens its control panel in an Electron window.
vMix loads `/output` through a Web Browser Input. PDF.js, fonts, CMaps, and WASM
resources are served locally. Presentations do not require internet access.

```text
src/main/    Window, tray icon, preload, Node-only server process
src/server/  HTTP API, library, backups, vMix Bridge, diagnostics
src/web/     Control panel, themes, PDF.js session, thumbnails, output
integrations/vmix/  VB commands and Shortcuts template
tests/       API, data, compatibility, theme, and window tests
assets/      Application icons
LICENSES/    Third-party resource licenses
.github/     Tests and Windows build workflows
```

Presentation state contains sessionId, documentId, revision, and page number.
The output polls state sequentially and renders into a back buffer canvas.
It rechecks the revision and dimensions before replacing the visible frame.
An outdated render cannot replace a newer frame. Switching PDFs releases the
previous PDFDocumentLoadingTask.

The output sends a heartbeat with its source identifier and render status.
The preview is marked separately and cannot confirm vMix readiness.
Each background heartbeat response is fully consumed before the next request.

Electron starts the server as a Node-only process using the same EXE. The server
exits when its parent exits or disconnects. The profile remains at
`%APPDATA%/PDF Viewer` so renaming the app does not create an empty library.
Queue updates check the revision; the server prevents deleting the active PDF.

The server listens on local interfaces and validates Host, Origin, and the client
subnet. Port availability is confirmed by a loopback request, accounting for
Windows wildcard binding behavior. vMix Bridge updates the selected source address.

Legacy inputs named `PDF Viewer @port` keep their prefix for installed VB commands.
New inputs use `vMix PDF Viewer @port`. New command files support both formats and
refuse to choose arbitrarily when several matching inputs exist.

`theme.js` runs before CSS. A saved preference overrides the system theme.
A host cookie preserves the choice across ports, with localStorage as a fallback.
The switch remains usable if storage is blocked. `theme.css` affects only the
control panel; the PDF output has its own page and styles.
