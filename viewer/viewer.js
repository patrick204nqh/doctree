/**
 * viewer.js
 * Entry point. Supports two modes:
 *   1. Single-file mode - launched from content_script via ?url=<file://>
 *   2. Folder mode      - the reader picks a directory; its tree shows in the sidebar
 */
import { bodyEl } from './state.js';
import './settings.js';
import { refreshFolders, restoreRoot } from './folders.js';
import { loadFromStorage, setTitle } from './reader.js';

const fileUrl = new URLSearchParams(window.location.search).get('url');

if (fileUrl) {
  setTitle(decodeURIComponent(fileUrl.split('/').pop()));
  loadFromStorage(fileUrl);
  refreshFolders();
} else {
  bodyEl.innerHTML =
    '<p style="color:var(--muted);padding:2em">Click Open Folder to pick a folder, or open a .md file in Chrome.</p>';
  restoreRoot();
}
