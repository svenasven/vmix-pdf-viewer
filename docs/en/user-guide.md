# User guide

[Русский](../user-guide.md) | **English**

Choose English or Russian in Settings → Language. Your choice is saved across restarts and port changes. Russian labels are included below for users switching from the Russian interface.

## Documents and presentation

Click **Add PDF (Добавить PDF)** and select one or more files. The first PDF opens
automatically. **Show (Показать)** opens a document from the beginning. Click a
thumbnail to show that page, or use the arrows, first/last page buttons, or page number field.

Drag documents in the queue or use the arrows next to them. To remove an inactive PDF,
click its trash button and confirm. The active PDF cannot be removed: select another
document first. Reordering the queue and removing other documents preserve the current presentation.
The file size limit is 50 megabytes per PDF. Password-protected and damaged files are rejected.

## Connecting vMix

Enable Web Controller/API in vMix. In the app, open
**Settings → Set up vMix (Настройки → Настроить vMix)**. Click
**Find vMix (Найти vMix)**, then select an existing source or add a new one.
The source address updates automatically when the app's port changes.
The recommended Browser Input size is 1920 × 1080. Save your vMix preset after setup.

After restarting vMix, the app automatically reconnects to the saved source
and resumes the current document.

**Check connection (Проверить подключение)** shows API connectivity, whether the selected
source exists, and whether it has confirmed the current page. Recovery reconnects the
same source. A ready page does not mean the source is on air: control Program in vMix.

## Keyboard, clicker, and MIDI

Save the command files provided by the wizard. For each file, use vMix:
**Settings → Scripting → Add → Import → Save → Close**. Copy the command name from the wizard.
For Page Down / Page Up, import the wizard's Shortcuts template. Before applying it,
export your current shortcuts: importing a template may replace them.

To assign an individual key or MIDI button, open
**Settings → Shortcuts → Add → Find**, press the key or button,
select **Function: ScriptStart**, and enter the command name:

| Name | Action |
|---|---|
| PDF_Next / PDF_Previous | Next / previous page |
| PDF_NextDocument / PDF_PreviousDocument | Next / previous document |
| PDF_First / PDF_Last | First / last page |

For MIDI, configure a single trigger on button press. MIDI control works through vMix Shortcuts.

Commands from versions before 0.10 work with legacy source names. New command files
support both naming formats. For a new source named `vMix PDF Viewer @port`, update
older commands using **Edit → Import**. Command names and shortcut assignments stay the same.

## Theme, network, and backups

The logo at the top left switches themes. Click it or use Enter or Space when it has
keyboard focus. Its tooltip describes the next theme. Your choice survives port changes.
The first launch follows the system theme. PDF colors do not change.

Local network addresses are listed in Settings. Open an address on a device in the
same subnet. Connected devices on that trusted network can control the library.

**Settings → Backup (Настройки → Резервная копия)** saves the library, document order,
page, and vMix API port. Restoring into a nonempty library adds documents without
changing the current presentation. On a new computer, reconnect the source using the wizard.

The window's close button hides it in the system tray. The presentation and commands
continue running. Click the tray icon to reopen the window. To quit completely,
use the tray icon menu → **Quit (Выйти)**.
