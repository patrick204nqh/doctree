# Doctree

A Chrome extension to read a local folder in the browser: a sidebar tree on the left, the file on the right.

Forked from [aktnk/chrome-markdown-viewer](https://github.com/aktnk/chrome-markdown-viewer) (MIT).

## What it reads

| Type | **Preview** (default) |
|------|----------|
| `.md` | Rendered Markdown (GFM, Mermaid diagrams, relative images, links between files). A leading `key: value` front matter block shows as a row of chips |
| `.html` | Rendered in a sandboxed frame: scripts run, but with no access to the extension or the folder. Relative stylesheets, scripts and images load from the folder, and links to other files open in Doctree |
| `.json`, `.jsonl` | A tree: objects and arrays fold, the first two levels start open, and **Expand all** and **Collapse all** open or close the rest. Text that does not parse, or a file over 1 MB or about 20,000 values, shows as indented, highlighted text |
| `.csv`, `.tsv` | A table with a sticky header row. Files over 1 MB show as text |
| `.rb`, `.py`, `.js`, `.ts`, `.sh`, `.rs`, `.go`, `.sql`, `.css`, `.xml`, `.yml`, `.yaml`, `.toml` | Source with syntax highlighting (no switch: this is the text) |
| `.txt`, `.log` | Plain text, exactly as in the file (no switch) |

**Preview | Raw:** a file with a preview has a switch at the right of the toolbar, or press `r`. **Raw** shows the exact text on disk, markup included, so you can select and copy it. The choice lasts for that file until you open another.

Text files over 256 KB show the first 256 KB with a **Show all** button. The toolbar shows the file type and size (`Ruby · 4.2 KB`). Fenced code blocks in Markdown are highlighted too.

Dotfiles, `node_modules` and folders with no supported file are hidden from the tree.

## Install

The extension is not published to the Chrome Web Store. Load it unpacked.

1. Clone this repository.
2. Open `chrome://extensions/` and turn on **Developer mode**.
3. Click **Load unpacked** and select this directory.

## Use

1. Click the toolbar icon. The viewer replaces the current tab; Back returns to the page you were on.
2. Click **Open Folder** and pick a folder. Chrome asks to allow read access.
3. The folder's entry file opens first: `index.md`, else `README.md`, else `task.md`. The same rule applies to every folder in the tree: click a folder's name to open its entry file and expand it, or its chevron to expand only.

The tree shows every name with its extension, folders in bold with a folder icon. The open file is highlighted, and so are the folders on the way to it. Each folder's entry file is listed first. The two buttons beside the folder name collapse every folder, and jump back to the open file.

**Reading full width:** the button at the left of the toolbar (or the `\` key) hides the tree, and Doctree remembers the choice. **Quick open** (`Cmd K`, or `Ctrl K` outside macOS) searches every file by path, so you can jump anywhere with the tree hidden. With an empty search it lists the files you opened last.

**Outline:** turn it on in Settings (or press `o`) to show the h1–h3 headings of the open file in a right-hand panel. Click a heading to jump to it. The current section is highlighted as you scroll.

**Breadcrumb:** the toolbar shows the open file's path, `folder / folder / file`. Hover a folder (or focus it and press the down arrow) to list what it holds: the entry file, then subfolders, then files. Hover a subfolder (or press the right arrow) to open its list beside it, as deep as the folders go; the left arrow goes back. Folders with no file Doctree can show are not listed. Pick a file to open it. Pick a subfolder, or click a folder in the path, to open the first file in it (the entry file when it has one). Escape closes the lists.

**Settings:** the sliders button at the right of the toolbar opens one panel for every saved preference: theme, reading width (`w`), breadcrumb, outline (`o`) and file tree (`\`). Each is a two-way switch, and Doctree remembers every choice. Reading width is **Full** by default; **Contained** limits text to an 860px column.

Links between files work with Back and Forward. A link to a folder (`flows/`) opens that folder's entry file, and `other.md#section` scrolls to the heading. The address bar `#path` is a deep link to the open file.

**Recent folders:** the arrow beside **Open Folder** lists the last 8 folders you opened. Pick one to switch to it, or use the cross to forget it. Doctree reopens the most recent one after a Chrome restart, or shows a **Reopen** button if Chrome asks for read access again.

**Copy:** the button copies the file's exact text, whichever view is showing. Its arrow offers the same text, the absolute path, or the relative path (from the opened folder). Chrome does not tell an extension where a folder lives on disk, so the first time you copy an absolute path Doctree asks for the folder's location once and remembers it for that folder. A code block shows its own **Copy** button on hover.

The filter box above the tree matches file paths, folder names included.

**Refresh:** Chrome gives an extension no file-change events, so Doctree polls. The open file reloads within 2 seconds of a change. The tree rescans when you return to the tab, every 15 seconds while the tab is visible, and from the rescan button beside the folder name. A rescan redraws the tree only when a file was added, renamed or removed, and keeps your open folders, scroll position and filter. On a very large folder the interval stretches, so scanning stays cheap.

The theme follows the system until you pick one in Settings.

Opening a `.md` file directly in Chrome also renders it. This needs **Allow access to file URLs** on the extension card (Details). The folder tree does not need it.

## Permissions

`storage` (single-file mode) and `file://*`. No host access to websites: Doctree itself calls no site. Content you open can: Markdown that links to a remote image loads it, and an HTML file can load scripts, styles and images from the web inside its sandboxed frame.

## Develop

`viewer/core.js` holds the pure logic (tree building, search, link resolution, file types, JSON and CSV parsing, front matter, heading ids, recent files, hash paths) with no DOM, so Node can test it: `npm test`. The rest of `viewer/` is plain ES modules with no build step, one per feature:

| File | Owns |
|------|------|
| `viewer.js` | Entry point: single-file or folder mode |
| `state.js` | Open folder and file, shared page elements, saved preferences |
| `dom.js` | Icons, element builders, popover menu behaviour |
| `settings.js` | Settings panel, tree toggle, keyboard shortcuts |
| `folders.js` | Pick, remember and switch folders (IndexedDB); copy path |
| `tree.js` | Sidebar tree, filter, resize, rescan |
| `crumbs.js` | Breadcrumb and its folder lists |
| `palette.js` | Quick open and recent files |
| `outline.js` | Outline panel |
| `reader.js` | Navigation, Markdown, code, table and HTML rendering, reload on change |
| `html-frame.html` | Sandboxed page that runs an opened HTML file (declared under `sandbox` in the manifest) |

Check the DOM code by loading the extension unpacked.

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES).
