# Security

## Report a vulnerability

Use GitHub's private reporting: **Security** tab, then **Report a vulnerability**. Please do not open a public issue for a security problem. Expect a first reply within 7 days.

## What Doctree guards against

- **Markdown:** the rendered HTML goes through DOMPurify. Scripts, event handlers, `javascript:` links, `<style>` and `<form>` are removed. Mermaid diagrams run at `securityLevel: 'strict'`.
- **HTML files:** an opened `.html` file runs its scripts in a sandboxed frame (`viewer/html-frame.html`) with a unique origin. It has no access to the extension APIs or to the opened folder. This is by design: the file is code you chose to open.
- **Read-only:** the folder picker is opened in `read` mode. Doctree never writes, uploads or deletes.

## Known limits

- A Markdown file can load a remote image, and an HTML file can load remote scripts, styles and images inside its sandbox. Doctree itself calls a website only for links to trusted sites the reader lists in Settings: a public-API request for a hover card (shown as plain text) and the thumbnail of a video link alone on its line.
- Open only HTML files you trust, as you would in any browser.

## Supported versions

Only the latest release gets fixes.
