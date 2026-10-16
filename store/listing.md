# Chrome Web Store listing

Paste each block into the matching field of the developer dashboard.

## Summary (max 132 characters)

Read a local folder as a tree: Markdown, HTML, JSON, CSV and source files, in the browser. Read-only.

## Single purpose

Doctree lets you browse a local folder and read its files in a browser tab.

## Description

Doctree opens a folder on your computer and shows a file tree on the left and the file on the right. It is read-only: it never edits, uploads or deletes anything.

- Markdown with GitHub-style tables, task lists, Mermaid diagrams, relative images and links between files
- HTML files in a sandboxed frame, JSON as a foldable tree, CSV as a table, source files with syntax highlighting
- Quick open (Cmd/Ctrl K), breadcrumb folder lists, outline panel, Preview | Raw switch, copy path
- Light and dark theme, keyboard first
- No account, no tracking, no network calls of its own

Opening a .md file directly in Chrome also renders it. This needs "Allow access to file URLs" on the extension card.

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Holds the text of a Markdown file opened from a file:// URL for the viewer tab. Removed when the viewer closes. |
| Host `file://*` and content script on `file://*` | Detects a .md file opened directly from disk and redirects it to the viewer, and lets the viewer load images and files that sit beside it. |
| Sandbox page `viewer/html-frame.html` with `'unsafe-inline' 'unsafe-eval' https:` | Runs an HTML file the user opened, the way a browser would, in a unique origin with no extension APIs and no folder access. Doctree ships no remote code: the sandbox only runs the user's own file and the scripts that file names. |

## Privacy practices

- Data collected: none.
- Remote code: no. The sandbox runs only the user's local HTML file, see above.
- Privacy policy URL: https://github.com/patrick204nqh/doctree/blob/main/PRIVACY.md

## Assets

- Screenshots, 1280x800: `docs/screenshots/markdown.png`, `mermaid.png`, `json.png`, `dark-outline.png`, `quick-open.png`.
- Still to make: small promo tile, 440x280 (crop from `brand/doctree-brand-kit.png`).
