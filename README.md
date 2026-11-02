# Schémo

**English** · [Français](README.fr.md)

> **Vibe-coded project.** Schémo was written entirely by an AI (Claude Code), directed by someone with no programming experience. No warranty: test it before relying on it.

A diagram editor for Windows, somewhere between draw.io and Excel's SmartArt: you draw boxes and arrows with the mouse, and **the diagram arranges itself** based on your links.

- **Loop** (A → B → C → A): boxes are placed in a circle, with curved arrows. A box hooked onto the circle points outward, like a ray.
- **Tree** (one head, several branches): top-to-bottom hierarchy (org chart). A box with many children arranges them in "hanging" columns.
- **Chain** (A → B → C): left-to-right process that snakes onto a new line when it gets long.
- **Mix**: each loop stays a circle and the rest is arranged in layers around it (ELK engine).
- An arrow **A → B means "A comes before B"**.

## Install

Download `Schemo-Setup.exe` from the [Releases](https://github.com/LeEvSa/Schemo/releases), double-click it and follow the screens. You choose the install folder (administrator rights are only needed for a protected folder or an install for all users). Schémo adds a Start menu shortcut (the desktop shortcut is a checkbox on the last screen), and you can pin it to the taskbar. Your diagrams don't need the Internet.

- **Update:** when it starts, Schémo checks GitHub for a new version and offers it to you. Without Internet it says nothing. Your diagrams are never sent anywhere (see [SECURITY.md](SECURITY.md)). You can also use File → Check for updates. Nothing installs without your approval.
- **Uninstall:** Windows Settings → Apps, or `Uninstall Schemo.exe` in the install folder. Your `.schemo` files stay.

The first time, Windows may show "Windows protected your PC" (the exe is not signed):
click **More info → Run anyway**.

For a USB key or a PC where you don't want to install anything: `Schemo.exe`, the portable version. It starts more slowly (it unpacks itself at every launch), **can't be pinned** to the taskbar (Windows would pin its temporary folder, which disappears) and doesn't update itself.

## Use

| Gesture | Effect |
|---|---|
| Double-click the background | New box (inside the frame if you click in one) |
| Click a **+** around a box | Adds a linked box: after, before, beside, or inserted in the cycle |
| Drag a **+** to a box or a frame | Draws an arrow (to empty space: creates a box at the end) |
| Click a frame's title bar | Shows its **+**: a frame links like a box |
| Double-click a box | Type in it (Shift+Enter moves to the description) |
| Drag a box | Pins it there; the rest arranges itself around it. Click the pin to release it |
| Drag a box into a frame | Puts it in that frame |
| Drag the background / mouse wheel | Move the view / zoom |
| Shift + drag the background | Select several boxes |
| Right-click | Menu for the box, arrow, frame or background |

- **Shape menu** (top bar or panel): Automatic, Cycle, Hierarchy, Process, List, Pyramid, Mind map, Timeline, for the whole tab or a single frame.
- **Frames** (Ctrl+G): group boxes, resize themselves, and collapse (chevron) to lighten large diagrams.
- **Tabs** at the bottom, like Excel; one `.schemo` file holds all the tabs.
- **Right panel**: box shape and color, description (in Markdown), arrow style (straight, curved, right angles, dashes, heads, text), color themes, spacing, reading direction.
- **Export** (Ctrl+E): PNG (white or transparent background, high resolution), PDF (fitted page or Letter/Legal/Tabloid, one or all tabs), SVG.
- Shortcuts: Ctrl+Z/Y, Ctrl+C/X/V/D, Del, F2, Ctrl+A, Ctrl+F, Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+0, F1 (help).
- Automatic backup: if Schémo closes without saving, it offers to recover your work at the next launch.

## Language

Globe button (FR / EN) at the top right, or File → "Langue · Language". The choice is remembered. The interface is in French and English.

## Colors

- **The whole diagram** (right panel, nothing selected): below the themes, edit the chosen one.
  - *Gradient*: start and end colors, ready-made presets, swap, "Box by box" or "Inside the box" with its direction.
  - *Blue, Green, Orange, Purple, Single color*: the main color.
  - *Colorful, Pastel, Night*: the 8 palette colors.
  - *All boxes*: text and border color. "Remove per-box colors" puts boxes back on the tab's colors.
- **A box or a selection**: solid color or gradient, text color, border color.

## Description

Under its title, a box can have a description written in Markdown (right panel, or Shift+Enter in the box):
`**bold**`, `*italic*`, `` `code` ``, `~~strikethrough~~`, `# heading`, `- list`, `1. list`, `- [ ] checkbox`, `> quote`, `---` for a line.
Each line you write stays a line. A link `[text](url)` shows underlined, without opening. Sub-points from older files become a list.

## Timeline

File → **New timeline sheet**, or the **Timeline** shape in the right panel (for a tab or a frame).
Select a box and write its date in the **Date** field: `2026-03-15`, `15/03/2026`, `March 2026`, `Q1 2026`, `1967`, `500 BC`, `Day 3`, `14:30`. French works too (`mars 2026`, `T1 2026`, `500 av. J.-C.`).
Periods work as well: `from 2000 to 2010`, `2000-2010`, `3 to 15 March 2026`, `March to June 2026`, `since 2010`, `1990s`, `20th century`. A band shows them on the line, and the text under the field tells you whether Schémo understood.
Boxes sort themselves and your date displays as you wrote it. Boxes are evenly spaced: the distance is not to time scale.
A box with no date stays after the previous one. A box dragged by hand is pinned and leaves the line; click the pin to put it back.

## Development

```bash
npm install
npm test              # layout engine tests (node)
npm start             # builds and runs (needs a display)
npm run dist          # builds dist/Schemo-Setup.exe and dist/Schemo.exe (portable) from Linux
```

Structure: `src/layout/` (layout engine), `src/render/` (SVG drawing, arrows, themes, export),
`src/ui/` (panel, tabs, mouse, editing), `src/app.js` (controller), `electron/` (window, files, PDF).
See `CLAUDE.md` for technical details (in French).

## Updates

The list is in [CHANGELOG.md](CHANGELOG.md). Each update is named week.number: `1.1` is the first of week 1.

## License

Schémo's code is under the [MIT](LICENSE) license. Third-party software shipped with the executable is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
