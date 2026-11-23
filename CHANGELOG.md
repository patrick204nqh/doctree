# Changelog

## Unreleased

- Mermaid: `.mmd` and `.mermaid` files are listed in the tree and render as a diagram, with **Raw** for the source.
- CSV and TSV: files up to 5 MB show as a table (was 1 MB); larger files still show as text.
- CSV and TSV: a bar above the table filters rows by text with a row count. Each header sorts its column: click for ascending, again for descending, again for file order, with an arrow showing the state. Numbers sort by value, text in natural order, empty cells last.
- CSV and TSV: Copy copies the matching rows (filter and sort applied, every page) as CSV or TSV, not the whole file.
- CSV and TSV: `http(s)` cells are links, long cells are cut to one line with the full text on hover (Settings → Tables → **Wrap long cells** shows them whole), and `/` focuses the filter box.
- CSV and TSV: the filter, column and sort are kept when the file reloads after a change on disk.
- CSV and TSV: rows come in pages (100, 500, 1,000 or all; default 500, set in Settings → Tables → Rows per page) with ‹ › buttons and a range in the row count, so a large file opens and re-sorts quickly. Only the visible page is built in the DOM.
- Settings: three sections, General, Tables (Rows per page, Wrap long cells) and Trusted sites. Trusted sites are badges: type a domain and press Enter, a space or a comma (or paste a list) to add one, × to remove it. What the list does is in an info icon beside the heading, not a line of text.
- CSV and TSV: a checkbox column selects rows (shift-click for a range, the header box for every matching row). A selection bar floats over the bottom of the table while rows are selected (count, Copy, five flag colours, Clear), so the toolbar and pager don't move, and a **Flags** menu in the filter bar shows all, flagged, unflagged or one colour, so you can flag rows, clear the filter and compare. Flags are saved in the browser per folder and file, never written to the folder, and follow the row's content.
- CSV and TSV: a **Chart** button charts one column of the matching rows, so it follows the filter. A text column shows its most common values with counts (click a bar to show only those rows; a chip in the bar clears it), a number column shows a histogram.
- CSV and TSV toolbar: the filter column dropdown is replaced by a **Columns** menu that shows or hides columns (saved per file, shown on the button as "Columns · 2 hidden"). The filter searches the visible columns and Copy takes them. **Flags** is a menu with counts and colour dots, and the bar is now: filter, Columns, Flags, Chart, then the row count and pager.
- CSV and TSV filter: `column:text` limits a word to one column (`item_url:themeforest.net`; a prefix that is not a column name, like `https:`, stays part of the text), `-word` excludes, `"quoted phrase"` keeps words together, and every word must match. A phrase typed without quotes is now matched word by word.

## 1.4.0 — 2026-11-18

- Icons: `:github:`, `:buildkite:`, `:jira:`, `:docker:` and about twenty more brand names show as icons (bundled, no network), and common emoji names like `:rocket:` and `:white_check_mark:` show as emoji. Code, code blocks and diagrams keep the text, an unknown `:name:` stays as typed, and copying a quote pastes the icon as its `:name:`.
- Colors: inline code that is a hex color (`#E600E6`, `#fff`, `#11223380`) shows a swatch of that color after it.
- Media: `.mp3` and `.mp4` files are listed in the tree and play in the browser's own player.
- Fix: the Copy button works on a picture. `.png`, `.jpg`, `.gif` and `.webp` files copy to the clipboard as an image (converted to PNG) and paste into Slack, Jira or a PR. It was greyed out before.
- Fix: the outline no longer lists headings inside a quote, so a quoted Context / Done When block under a ticket doesn't crowd out the file's own headings. Links to those headings still work.
- Fix: copying a quote gives its Markdown source, so inline code, bold, italics, lists and nested quotes paste as written instead of losing their backticks and markers.
- Fix: copying a quote with a link keeps the link in the plain-text copy as `[text](url)`, so it survives a paste into a terminal, editor or chat that reads plain text. It was reduced to the link's text alone, so the URL was lost. The rich HTML copy still pastes as a real hyperlink in Slack, Confluence and Gmail.
- Links to files in the open folder: hovering one shows the file's name, folder path and type (or "Not found in this folder"), and copying a quote or code block with one makes its rich link a `file://` path when the folder's location is set (Copy menu), else its path from the folder root, instead of a relative path that breaks once pasted.
- Trusted sites: Jira, Confluence (`atlassian.net`), AWS console, Datadog and Slack links show a hover card built from the URL alone (issue key, page title, service and region, message time). These sites need a login, so Doctree makes no request for them. Saved site lists keep their own entries: add `atlassian.net`, `aws.amazon.com`, `datadoghq.com`, `slack.com` in Settings.
- Trusted sites: `cloudflare.com`, `endoflife.date`, `thehackernews.com` and `google.com` are trusted by default (link label only, no hover card, no request). Saved site lists keep their own entries: add them in Settings.

## 1.3.0 — 2026-10-17

- Published on the Chrome Web Store.
- Images: `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif` and `.webp` files are listed in the tree and shown as pictures. SVG keeps a Raw view.
- Quotes: a Markdown blockquote gets the same hover Copy button as a code block, and copies its text without the `>` markers.
- Trusted sites: hovering a GitHub, Wikipedia, YouTube, Vimeo or Loom link shows a card, and a video link on its own line becomes a thumbnail card. The list is editable in Settings. Doctree now makes requests for these links only; see `PRIVACY.md`.
- Security: rendered Markdown now goes through DOMPurify, and Mermaid runs at `securityLevel: 'strict'`.
- Add `minimum_chrome_version` 102, `SECURITY.md`, `PRIVACY.md`, `CONTRIBUTING.md`, a CI test workflow and `npm run package`.
- Fix: the first element of a file has no top margin, so a file that starts with a heading no longer leaves an 80px gap under the toolbar.
- Docs: new README with logo, badges, screenshots, shortcuts and a demo folder (`examples/demo`).

## 1.2.0

- Settings panel, breadcrumb with folder lists, width toggle.
- Preview | Raw switch, Copy menu, JSON tree, code-block copy.
- Folder and anchor links, code, CSV and JSON views, sandboxed HTML.
- Front matter chips with links to files in the open folder.
- Notice when the open file is removed from disk.
