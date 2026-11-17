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

- **Shape menu** (top bar or panel): Automatic, Cycle, Hierarchy, Process, List, Pyramid, Mind map, Timeline, Story threads, Network, Story arc, Board, Family tree, Target, Parallel timeline, for the whole tab or a single frame.
- **Frames** (Ctrl+G): group boxes, resize themselves, and collapse (chevron) to lighten large diagrams.
- **Tabs** at the bottom, like Excel; one `.schemo` file holds all the tabs.
- **Right panel**: box shape (rounded, rectangle, pill, ellipse, circle, diamond, hexagon, parallelogram, and for stories shield, star, cloud, crown) and color, description (in Markdown), arrow style (straight, curved, right angles, dashes, heads, text), color themes, spacing, reading direction.
- **Export** (Ctrl+E): PNG (white, transparent or dark background, high resolution), PDF (white or dark, fitted page or Letter/Legal/Tabloid, one or all tabs), SVG (white, transparent or dark). On the dark background, arrows, frames and the timeline take their dark-mode colors.
- Shortcuts: Ctrl+Z/Y, Ctrl+C/X/V/D, Del, F2, Ctrl+A, Ctrl+F, Ctrl+S, Ctrl+O, Ctrl+N, Ctrl+0, F1 (help).
- Several windows at once: relaunch Schémo, use File → New window (Ctrl+Shift+N), or double-click a `.schemo` file. File → Open replaces the diagram in the window; File → Open in new window… keeps it. A file already open is shown in its window instead of being opened twice.
- Open, Save as and Export each remember the last folder you used. Save as starts in the diagram's own folder when it already has a file.
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
- **+ (Other color)** or a color dot opens the color picker: HEX code by default, or RGB / HSL. Schémo remembers the mode you chose and your recent colors. Enter or a click elsewhere keeps the color; Esc goes back to the starting color.

## Description

Under its title, a box can have a description written in Markdown (right panel, or Shift+Enter in the box):
`**bold**`, `*italic*`, `` `code` ``, `~~strikethrough~~`, `# heading`, `- list`, `1. list`, `- [ ] checkbox`, `> quote`, `---` for a line.
Each line you write stays a line. A link `[text](url)` shows underlined, without opening. Sub-points from older files become a list.

## Stories

Shapes made for planning stories (in the Shape menu, for a tab or a frame):

- **Story threads**: one frame per character or plot line, stacked as bands. Its scenes run left to right, in the order you created them. Scenes line up in time across bands: an arrow from a scene in one band to a scene in another pushes that scene after it. Each band gets its own color with the Colorful theme.
- **Network**: characters and their relationships. Linked boxes stay close to each other, with no top or bottom. New links are plain lines without arrowheads (write the relationship on the link, e.g. "friends"); add an arrowhead in the panel for a one-way relationship ("betrays"). Adding a character barely moves the others.
- **Story arc**: scenes run left to right along a curve that follows the tension of the story. Select a scene and pick its **Tension** (1 to 5) in the panel. A scene left on Auto sits between its neighbors; if no scene has a level yet, the arc takes the classic shape (rising to a peak two-thirds of the way, then falling).
- **Board**: one frame per act or chapter, as columns side by side, like index cards on a corkboard. Scenes stack inside, top to bottom. Drag a scene into another column to move it to that chapter. Boxes outside any column form an extra column on the right.
- **Family tree**: a line **without arrowheads** joins a couple, who sit side by side; an **arrow** goes from a parent to their child, and children sit under the middle of the couple. Two people with a child together are placed as a couple even without a line between them, and each person sits under their own parents, even when both partners come from different families. One color per generation. Around a person, the **+** below adds a child (linked to both members of the couple), above a parent, and on the sides a partner. To turn an arrow into a couple, set it to "no arrowhead" in the panel.
- **Target**: circles inside each other, to place a world or a cast. The oldest box with no incoming arrow sits in the center; what is linked to it goes on the 1st circle, what is linked to those on the 2nd, and so on. Boxes linked to nothing go on a last, dashed circle.
- **Parallel timeline**: one frame per character, stacked as bands like Story threads, but each scene is placed by its **Date**, on a time shared by all bands. A ruler at the top shows the dates, with light lines across the bands to read who does what at the same time. It follows the tab's **Time line** setting: Even (one column per date) or To scale (real gaps; scenes too close together stack inside their band).

## Timeline

File → **New timeline sheet**, or the **Timeline** shape in the right panel (for a tab or a frame).
Select a box and write its date in the **Date** field: `2026-03-15`, `15/03/2026`, `March 2026`, `Q1 2026`, `1967`, `500 BC`, `Day 3`, `14:30`. French works too (`mars 2026`, `T1 2026`, `500 av. J.-C.`).
Periods work as well: `from 2000 to 2010`, `2000-2010`, `3 to 15 March 2026`, `March to June 2026`, `since 2010`, `1990s`, `20th century`. A band shows them on the line, and the text under the field tells you whether Schémo understood.
Boxes sort themselves and your date displays as you wrote it. By default boxes are evenly spaced. With nothing selected, the panel's **Time line** section switches to **To scale**: the gap between two boxes follows time, marks (years, months, days or hours) appear on the line, and boxes too close together move to another row. **Auto** picks the unit from the time covered; pick one yourself (Hours to Centuries) to set 1 unit = 110 px.
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
