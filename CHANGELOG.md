# Changelog

## Unreleased

- Images: `.svg`, `.png`, `.jpg`, `.jpeg`, `.gif` and `.webp` files are listed in the tree and shown as pictures. SVG keeps a Raw view.
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
