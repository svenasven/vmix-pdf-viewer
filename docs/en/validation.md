# Validation

[Русский](../validation.md) | **English**

## 0.10.1

27 automated tests passed. Packaged-app checks cover RU/EN, dialogs, language persistence, translated upload errors, and preservation of PDF filenames and the current page. The 16 core interface scenarios passed.

## 0.10.0

25 automated tests cover PDFs/API, the library, active-document protection, queue
order, backups, ports and networking, diagnostics, CEF compatibility, PDF.js disposal,
background reports, the window, source-name compatibility, and theme persistence.

The packaged Windows EXE passed 16 interface scenarios: queue management, pages,
deletion, backups, diagnostics, the wizard, commands, and error handling.
Six additional scenarios cover branding and themes.

Window checks confirm both themes, keyboard operation, dark dialogs, 375/760 px
layouts, and theme persistence after restarting and changing ports. Theme switching
does not change presentation state or PDF canvas pixels. Screenshots use documents
created specifically for demonstration.

### User testing of 0.10.0

Confirmed by the user on November 9, 2026:

- The app ran successfully for more than an hour.
- MIDI and the R400 clicker work.
- The app starts and works correctly on another computer.
- The connection and presentation resume automatically after restarting vMix.

## Baseline one-hour run: 0.9.6

November 8, 2026: 60 minutes and 1.5 seconds with a real Browser Input in
vMix Trial 29.0.0.49. Separate profile; PDFs with 3, 16, and 80 pages.

| Check | Result |
|---|---|
| Confirmed commands | 1188 regular + 12 LAN = 1200 |
| Application / JavaScript errors | 0 / 0 |
| Reorders / inactive PDF additions and removals | 60 / 30 |
| Rejected attempts to delete the active PDF | 20 |
| Backup checks / app restarts | 2 / 1 |
| API recovery, output recovery, port change, backups, LAN | All 5 scenarios passed |
| Time to heartbeat confirmation | Median 851 ms, p95 1294 ms |

719 Windows memory measurements were collected. The previous sustained multi-gigabyte
growth in PDF Viewer was not observed.
