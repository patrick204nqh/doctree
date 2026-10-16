# Contributing

Doctree is plain ES modules with no build step.

1. Fork and clone.
2. `npm test` runs the pure logic in `viewer/core.js` (Node 20+, no dependencies to install).
3. Load the repo unpacked in `chrome://extensions` (Developer mode) to check DOM changes. Reload the extension after each edit.

Keep logic that needs no DOM in `core.js` with a test in `test/core.test.js`. Read `PRODUCT.md` first: Doctree is a quiet, read-only reader, so changes that add chrome or write to the folder will not be merged.

`npm run package` builds `doctree.zip` for the Chrome Web Store.
