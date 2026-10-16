# Doctree — agent guide

Chrome extension (Manifest V3) to read a local folder in the browser: file tree on
the left, file on the right. Markdown, HTML, JSON, CSV and source files. Read-only,
no account, no tracking, no network calls.

## Layout

| Path | What |
|---|---|
| `background/service_worker.js` | Extension lifecycle, folder access, messaging |
| `content/content_script.js` | In-page glue |
| `viewer/` | Viewer app: `html-frame.html` runs in a sandboxed frame |
| `libs/` | Vendored third-party minified JS; each carries its `*.LICENSE*` file here — keep them |
| `icons/`, `brand/` | Icons and brand assets |
| `docs/screenshots/` | README screenshots |
| `examples/demo/` | Sample folder for trying the extension |
| `store/` | Chrome Web Store listing draft (`listing.md`) |
| `test/` | Node tests |

## Commands

- `npm test` — `node --test test/*.test.js`, no framework, no build step.
- `npm run package` — produces `doctree.zip` (manifest, background, content,
  viewer, libs, icons, LICENSE, THIRD_PARTY_NOTICES) for the Web Store upload.

## Loading locally

1. `chrome://extensions/` → enable Developer mode → **Load unpacked** → repo root.
2. Click the toolbar icon, **Open Folder**, pick a folder.

## Conventions

- Plain ES modules, no bundler, no runtime dependencies beyond `libs/`.
- The extension never writes, uploads or deletes user files; rendered HTML is
  sanitized with DOMPurify.
- User-facing changes append to `CHANGELOG.md` (Keep a Changelog, semver in
  `manifest.json` and `package.json` together).
- `THIRD_PARTY_NOTICES` and each `libs/*.LICENSE*` must stay in sync with the
  vendored files.
- Contributions: see `CONTRIBUTING.md`; security: see `SECURITY.md`.