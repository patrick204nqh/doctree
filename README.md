# Doctree

A Chrome extension to read a local folder in the browser: a sidebar tree on the left, the file on the right.

Forked from [aktnk/chrome-markdown-viewer](https://github.com/aktnk/chrome-markdown-viewer) (MIT).

## What it reads

| Type | Shown as |
|------|----------|
| `.md` | Rendered Markdown (GFM, Mermaid diagrams, relative images, links between files). A leading `key: value` front matter block shows as a row of chips |
| `.json`, `.jsonl`, `.txt`, `.tsv`, `.csv`, `.html` | Plain text, exactly as in the file (`.html` is shown as source, never run). Files over 256 KB show the first 256 KB with a **Show all** button |

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

**Outline:** the Outline button (or the `o` key) shows the h1–h3 headings of the open file in a right-hand panel. Click a heading to jump to it. The current section is highlighted as you scroll. Doctree remembers whether it is shown.

**Width:** text fills the whole window by default. The **Contain** button (or the `w` key) limits it to a 860px column; the button then reads **Full width** to switch back. Doctree remembers the choice.

Links between files work with Back and Forward, and the address bar `#path` is a deep link to the open file.

**Recent folders:** the arrow beside **Open Folder** lists the last 8 folders you opened. Pick one to switch to it, or use the cross to forget it. Doctree reopens the most recent one after a Chrome restart, or shows a **Reopen** button if Chrome asks for read access again.

**Copy path** copies the absolute path. The arrow beside it also offers the relative path (from the opened folder). Chrome does not tell an extension where a folder lives on disk, so the first time you copy an absolute path Doctree asks for the folder's location once and remembers it for that folder.

The filter box above the tree matches file paths, folder names included.

**Refresh:** Chrome gives an extension no file-change events, so Doctree polls. The open file reloads within 2 seconds of a change. The tree rescans when you return to the tab, every 15 seconds while the tab is visible, and from the rescan button beside the folder name. A rescan redraws the tree only when a file was added, renamed or removed, and keeps your open folders, scroll position and filter. On a very large folder the interval stretches, so scanning stays cheap.

The button on the right of the toolbar switches between light and dark. Doctree follows the system theme until you click it, then remembers your choice.

Opening a `.md` file directly in Chrome also renders it. This needs **Allow access to file URLs** on the extension card (Details). The folder tree does not need it.

## Permissions

`storage` (single-file mode) and `file://*`. No host access to websites: it cannot call any site, though Markdown that links to a remote image still loads it.

## Develop

`viewer/core.js` holds the pure logic (tree building, search, link resolution, front matter, heading ids) with no DOM, so Node can test it: `node --test 'test/*.test.js'`. `viewer/viewer.js` is the DOM and Chrome wiring; check it by loading the extension unpacked.

## License

MIT. See [LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES](./THIRD_PARTY_NOTICES).
