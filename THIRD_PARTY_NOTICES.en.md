# Third-party notices

[Русский](THIRD_PARTY_NOTICES.md) | **English**

vMix PDF Viewer code is distributed under MIT. Third-party components retain
their own licenses and copyright notices.

| Component | Purpose | License |
|---|---|---|
| Electron | Windows application shell and embedded browser | MIT; Chromium and Node.js have additional notices |
| PDF.js / pdfjs-dist | PDF rendering, CMaps, fonts, and WASM | Apache-2.0 and separate licenses for bundled resources |
| pdf-lib | Page counts and PDF validation | MIT |
| fast-xml-parser | Reading the vMix API | MIT |
| electron-builder | Application packaging | MIT |

Full license texts for PDF.js and its resources, pdf-lib, fast-xml-parser, and Electron
are collected in [LICENSES](LICENSES). Chromium notices are also provided in
`LICENSES.chromium.html` with Electron. Transitive dependencies retain the licenses
in their npm packages; exact versions are pinned in `package-lock.json`.

vMix and Logitech R400 are names of third-party products. This project is independent.
The controller photo from the early local prototype is not part of the source
distribution and is not distributed under the project's MIT license.
