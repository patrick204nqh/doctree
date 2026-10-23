# Changelog

## Unreleased

- Fix: copying a quote gives its Markdown source, so inline code, bold, italics, lists and nested quotes paste as written instead of losing their backticks and markers. A reference-style link copies as an inline `[text](url)` link.
- Fix: the Copy button on a quote or code block no longer drops links. Plain text keeps `[text](url)` and the clipboard also carries rich HTML, so pasting into Slack, Confluence or Gmail gives a real hyperlink.
- Links to files in the open folder: hovering one shows the file's name, folder path and type (or "Not found in this folder"), and copying a quote or code block with one gives its `file://` path when the folder's location is set (Copy menu), else its path from the folder root, instead of a relative path that breaks once pasted.
- Trusted sites: Jira, Confluence (`atlassian.net`), AWS console, Datadog and Slack links show a hover card built from the URL alone (issue key, page title, service and region, message time). These sites need a login, so Doctree makes no request for them. Saved site lists keep their own entries: add `atlassian.net`, `aws.amazon.com`, `datadoghq.com`, `slack.com` in Settings.

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
