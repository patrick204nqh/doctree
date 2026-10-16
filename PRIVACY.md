# Privacy policy

Doctree collects no data. It has no server, no analytics and no account, and it sends nothing anywhere.

## What stays on your device

| Data | Where | Why |
|---|---|---|
| Handles of the last 8 folders you opened | IndexedDB (`doctree`) | Reopen a folder |
| Theme, width, breadcrumb, outline and tree settings, and the last 8 file paths opened in each folder | `localStorage` of the viewer page | Remember your choices and show recent files |
| Text of a Markdown file opened directly from a `file://` URL | `chrome.storage.local` | Pass it to the viewer. Removed when the viewer closes |

Clearing the extension's data in Chrome removes all of it. File contents are read in the browser to show them and are not copied elsewhere.

## Content you open

Doctree makes network requests only for links to the trusted sites listed in Settings (by default YouTube, Vimeo, Loom, GitHub and Wikipedia): hovering such a link asks that site's public API for a title and description, and a video link on its own line also loads its thumbnail from the site. Nothing else is sent, no cookies or account data go with it, and removing a site from the list stops the requests. Content you open can also make requests: a Markdown file that links to a remote image loads that image, and an HTML file can load scripts, styles and images from the web inside its sandboxed frame. Those requests go from your browser to that site.

## Contact

Open an issue at https://github.com/patrick204nqh/doctree/issues.
