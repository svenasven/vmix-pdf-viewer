# Contributing

[Русский](CONTRIBUTING.md) | **English**

Use Issues for suggestions and bug reports. For code changes, create a branch and
a pull request describing the resulting behavior and how you checked it.

```powershell
npm ci --omit=optional
npm test
npm run desktop
```

Requires Node.js 24+. Tests start local servers on available ports.
Testing a real Web Browser Input requires Windows with vMix.

When adding commands, update `src/server/vmix-commands.js`, the generated files in
`integrations/vmix`, and the user guide together. Preserve compatibility with legacy
source names and the existing library path. Fully consume background request responses;
the 0.9.6 fix prevents browser resources from being retained.

Run `npm test` before submitting. For interface changes, check both themes,
keyboard navigation, dialogs, 375/760 px layouts, and preservation of the current
presentation. Do not commit user PDFs, profiles, backups, or local diagnostic data.
Keep English and Russian documentation in sync.

Contributions are accepted under the project's MIT license.
