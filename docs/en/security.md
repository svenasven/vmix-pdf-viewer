# Networking and data

[Русский](../security.md) | **English**

The app is intended for a trusted local network. Devices on the same subnet can
change documents and control the presentation. There are no built-in user accounts,
passwords, or access roles. Do not expose the application port to the internet.

The server validates Host, Origin, and the client subnet. This limits requests
from unrelated web pages but does not replace device authorization on your network.
The vMix API is accessed through loopback.

PDFs and the profile are stored locally. A `.pdfviewer-backup` file contains the
documents themselves. Theme preferences in cookies/localStorage do not contain
library data.

The Git repository contains source code, documentation, and screenshots created
for demonstration. Working libraries, profiles, memory dumps, and backups are not
part of the source distribution. Before reporting a vulnerability, arrange a
private way to share details with the owner. Do not attach confidential PDFs or secrets.
