/**
 * reader.js
 * Opens a file and shows it: navigation (links, history, deep links), Markdown and text
 * rendering, relative images, and reload when the file changes on disk.
 */
import { state, bodyEl, fileNameEl, contentWrapper, copyGroup } from './state.js';
import { LINK, splitFrontmatter, resolvePathArray, resolveUrl, escapeAttr, hashToPath, pathToHash } from './core.js';
import { buildToc } from './outline.js';
import { renderCrumbs } from './crumbs.js';
import { highlightActiveByPath } from './tree.js';
import { rememberRecent } from './palette.js';
import { isDark } from './settings.js';

const TEXT_CAP = 256 * 1024; // bytes shown before "Show all"
const RELOAD_CHECK_MS = 2000;
let blobUrls = []; // object URLs to revoke on next file load

/* ── Navigation: links, history, deep links ─────────────────────────────── */
bodyEl.addEventListener('click', (e) => {
  const anchor = e.target.closest('a[data-anchor]');
  if (anchor) {
    e.preventDefault();
    const id = anchor.dataset.anchor.slice(1);
    if (id) bodyEl.querySelector('#' + CSS.escape(id))?.scrollIntoView();
    return;
  }
  const a = e.target.closest('a[data-md-link]');
  if (!a || !state.rootHandle || !state.currentPath.length) return;
  e.preventDefault();
  openPath(resolvePathArray(state.currentPath, a.dataset.mdLink), 'push');
});

window.addEventListener('popstate', () => {
  const path = state.rootHandle && hashToPath(location.hash, state.rootHandle.name);
  if (path) openPath(path, null);
});

/** historyMode: 'push' adds a Back entry, 'replace' rewrites the current one, null leaves it. */
export async function openPath(pathArr, historyMode) {
  try {
    await loadFileHandle(await navigateToHandle(state.rootHandle, pathArr), pathArr);
  } catch (err) {
    console.warn('[Doctree] cannot open:', pathArr.join('/'), err);
    return;
  }
  highlightActiveByPath(pathArr);
  rememberRecent(pathArr);
  const hash = pathToHash(pathArr);
  if (historyMode === 'replace') history.replaceState(null, '', hash);
  else if (historyMode === 'push' && location.hash !== hash) history.pushState(null, '', hash);
}

/** Navigate from a root FileSystemDirectoryHandle to a file by path array. */
async function navigateToHandle(rootDirHandle, pathArr) {
  // pathArr[0] is the root dir name itself, skip it
  let handle = rootDirHandle;
  for (let i = 1; i < pathArr.length - 1; i++) {
    handle = await handle.getDirectoryHandle(pathArr[i]);
  }
  return await handle.getFileHandle(pathArr[pathArr.length - 1]);
}

/* ── Reload the open file when it changes on disk ───────────────────────── */
const stampOf = (file) => file.lastModified + ':' + file.size;

export async function reloadCurrent() {
  const top = contentWrapper.scrollTop;
  await loadFileHandle(state.currentHandle, state.currentPath);
  contentWrapper.scrollTop = top;
}

setInterval(async () => {
  if (document.hidden || !state.currentHandle) return;
  try {
    if (stampOf(await state.currentHandle.getFile()) === state.currentStamp) return;
    await reloadCurrent();
  } catch {
    // File removed or mid-write: keep what is on screen
  }
}, RELOAD_CHECK_MS);

/* ── Load a file ────────────────────────────────────────────────────────── */
async function loadFileHandle(handle, pathArr) {
  revokeBlobUrls();

  try {
    const file = await handle.getFile();
    state.currentHandle = handle;
    state.currentStamp = stampOf(file);
    state.currentPath = pathArr;
    copyGroup.hidden = false;
    setTitle(handle.name);
    renderCrumbs();
    if (/\.md$/i.test(handle.name)) {
      await renderMarkdown(await file.text(), { mode: 'folder' });
      await resolveImages(pathArr);
    } else {
      await renderText(file);
    }
  } catch (err) {
    console.error('[Doctree] loadFileHandle:', err);
    bodyEl.textContent = 'Could not read the file: ' + err.message;
    buildToc();
  }

  contentWrapper.scrollTop = 0;
}

/** Single-file mode: the content script left the raw text in chrome.storage.local. */
export function loadFromStorage(url) {
  const baseDir = url.substring(0, url.lastIndexOf('/') + 1);
  chrome.storage.local.get(url, async (result) => {
    if (chrome.runtime.lastError) {
      bodyEl.textContent = 'Storage error: ' + chrome.runtime.lastError.message;
      return;
    }

    let markdown = result[url];

    // Fallback: fetch the file directly (e.g. after a reload, once the unload
    // handler has already cleared storage)
    if (markdown == null) {
      try {
        const response = await fetch(url);
        markdown = await response.text();
      } catch (err) {
        bodyEl.textContent = 'Could not read the file: ' + err.message;
        return;
      }
    }

    await renderMarkdown(markdown, { mode: 'single', baseDir });
    contentWrapper.scrollTop = 0;
  });

  window.addEventListener('unload', () => {
    chrome.runtime.sendMessage({ type: 'REMOVE_STORAGE_KEY', key: url });
  });
}

/* ── Render ─────────────────────────────────────────────────────────────── */
async function renderMarkdown(markdown, { mode, baseDir }) {
  const renderer = new marked.Renderer();

  if (mode === 'single') {
    renderer.image = function ({ href, title, text }) {
      const src = resolveUrl(href, baseDir);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(text)}"${titleAttr}>`;
    };
    renderer.link = function ({ href, title, text }) {
      const resolved = resolveUrl(href, baseDir);
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      const target = /^https?:/.test(resolved)
        ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeAttr(resolved)}"${titleAttr}${target}>${text}</a>`;
    };
  }

  if (mode === 'folder') {
    // Mark internal links for JS navigation; open external links in new tab
    renderer.link = function ({ href, title, text }) {
      const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
      const url = escapeAttr(href);
      if (/^https?:/.test(href)) {
        return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
      }
      if (href.startsWith('#')) return `<a href="${url}" data-anchor="${url}"${titleAttr}>${text}</a>`;
      if (LINK.test(href)) return `<a href="#" data-md-link="${url}"${titleAttr}>${text}</a>`;
      return `<a href="${url}"${titleAttr}>${text}</a>`;
    };
  }

  const { fields, body } = splitFrontmatter(markdown);
  bodyEl.innerHTML = marked.parse(body, { renderer, gfm: true, breaks: false });
  if (fields.length) bodyEl.prepend(frontmatterCard(fields));
  buildToc();

  // Convert fenced mermaid blocks
  bodyEl.querySelectorAll('pre > code.language-mermaid').forEach((codeEl) => {
    const div = document.createElement('div');
    div.className = 'mermaid';
    div.textContent = codeEl.textContent;
    codeEl.parentElement.replaceWith(div);
  });

  mermaid.initialize({
    startOnLoad: false,
    theme: isDark() ? 'dark' : 'default',
    securityLevel: 'loose',
  });
  await mermaid.run({ querySelector: '.mermaid' }).catch((err) => {
    console.error('[Doctree] mermaid:', err);
  });
}

async function renderText(file) {
  const pre = document.createElement('pre');
  const capped = file.size > TEXT_CAP;
  pre.textContent = await (capped ? file.slice(0, TEXT_CAP) : file).text();
  bodyEl.replaceChildren(pre);
  buildToc();
  if (!capped) return;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = `Showing the first ${TEXT_CAP / 1024} KB of ${Math.ceil(file.size / 1024)} KB. Show all`;
  btn.addEventListener('click', async () => {
    pre.textContent = await file.text();
    btn.remove();
  });
  bodyEl.append(btn);
}

function frontmatterCard(fields) {
  const card = document.createElement('div');
  card.className = 'fm';
  for (const [key, value] of fields) {
    const chip = document.createElement('span');
    const label = document.createElement('b');
    label.textContent = key;
    chip.append(label, value);
    if (key === 'status') chip.dataset.status = value;
    card.append(chip);
  }
  return card;
}

/** Folder mode: point relative images at blob URLs read from the folder. */
async function resolveImages(filePath) {
  if (!state.rootHandle) return;
  for (const img of bodyEl.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (!src || /^[a-z][a-z\d+\-.]*:/i.test(src) || src.startsWith('/')) continue;
    try {
      const handle = await navigateToHandle(state.rootHandle, resolvePathArray(filePath, src));
      const url = URL.createObjectURL(await handle.getFile());
      blobUrls.push(url);
      img.src = url;
    } catch {
      // Image not found - leave broken src as-is
    }
  }
}

export function setTitle(name) {
  fileNameEl.textContent = name;
  document.title = name + ' — Doctree';
}

function revokeBlobUrls() {
  blobUrls.forEach(URL.revokeObjectURL, URL);
  blobUrls = [];
}
