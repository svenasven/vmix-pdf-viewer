# Development and builds

[Русский](../development.md) | **English**

Requires Node.js 24+ and npm. The desktop app and portable build target Windows x64.

```powershell
npm ci --omit=optional
npm test
npm run desktop
npm run build:win
```

Electron downloads its runtime during installation. If you installed dependencies
with `--ignore-scripts`, run `node node_modules/electron/install.js` before opening
the desktop app. The packaged EXE does not require a separate Node.js installation.

`npm start` runs the server without a desktop window, using `data/` for its library.
Automated tests create temporary libraries and use available loopback ports;
they do not require vMix to be running. To install only server dependencies, use
`npm ci --omit=dev --omit=optional`.

Builds are written to `release/`. Use a fresh output directory for another package:

```powershell
npm run build:win -- --config.directories.output=release-new
```

GitHub Actions tests Windows and Linux with Node.js 24. The Windows build workflow
runs manually or for a `v*` tag. It saves the EXE as an artifact and does not publish
a release automatically. Dependency versions are pinned in package-lock.json.

Before updating PDF.js, test a real vMix Browser Input, fonts, rotations, large
documents, rapid commands, and disposal of PDF.js tasks. Theme changes must not
affect the output frame or presentation state. See
[CONTRIBUTING.en.md](../../CONTRIBUTING.en.md) for contribution guidance.
