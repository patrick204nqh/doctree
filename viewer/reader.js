/**
 * reader.js
 * Opens a file and shows it: navigation (links, history, deep links), Markdown and text
 * rendering, relative images, and reload when the file changes on disk.
 */
import { state, bodyEl, fileNameEl, fileMetaEl, viewBtn, contentWrapper, copyGroup } from './state.js';
import {
  isRelativeLink, resolveLink, resolvePathArray, splitFrontmatter, resolveUrl, escapeAttr,
  hashToPath, pathToHash, fileInfo, formatSize, prettyJson, parseDelimited,
} from './core.js';
import { buildToc } from './outline.js';
import { renderCrumbs } from './crumbs.js';
import { highlightActiveByPath } from './tree.js';
import { rememberRecent } from './palette.js';
import { isDark } from './settings.js';

const TEXT_CAP = 256 * 1024; // bytes shown before "Show all"
const FORMAT_CAP = 1024 * 1024; // largest file shown formatted (JSON, CSV); highlighting stops at twice this
const RELOAD_CHECK_MS = 2000;
let blobUrls = []; // object URLs to revoke on next file load
let rawPath = null; // path of the file the reader switched to its raw text

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
  if (!a) return;
  e.preventDefault();
  followLink(a.dataset.mdLink);
});

/** Open a link found in a file: a file or folder in the open folder. Anything else is ignored. */
function followLink(href) {
  if (!isRelativeLink(href) || !state.rootHandle || !state.currentPath.length) return;
  const hit = resolveLink(state.allFiles, state.currentPath, href);
  if (hit) openPath(hit.path, 'push', hit.anchor);
}

// A rendered HTML file posts the links it cannot follow itself (see html-frame.html)
window.addEventListener('message', (e) => {
  const frame = bodyEl.querySelector('.html-frame');
  if (frame && e.source === frame.contentWindow && typeof e.data?.link === 'string') followLink(e.data.link);
});

window.addEventListener('popstate', () => {
  const path = state.rootHandle && hashToPath(location.hash, state.rootHandle.name);
  if (path) openPath(path, null);
});

/** historyMode: 'push' adds a Back entry, 'replace' rewrites the current one, null leaves it. anchor: heading id to scroll to. */
export async function openPath(pathArr, historyMode, anchor) {
  try {
    await loadFileHandle(await navigateToHandle(state.rootHandle, pathArr), pathArr);
  } catch (err) {
    console.warn('[Doctree] cannot open:', pathArr.join('/'), err);
    return;
  }
  if (anchor) bodyEl.querySelector('#' + CSS.escape(anchor))?.scrollIntoView();
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
    await renderFile(file, fileInfo(handle.name), pathArr);
  } catch (err) {
    console.error('[Doctree] loadFileHandle:', err);
    bodyEl.textContent = 'Could not read the file: ' + err.message;
    contentWrapper.classList.remove('fill');
    buildToc();
  }

  contentWrapper.scrollTop = 0;
}

/* The toolbar button swaps a file's formatted view for its raw text. */
const FORMATTED = { html: 'Rendered', csv: 'Table', tsv: 'Table', json: 'Formatted', jsonl: 'Formatted' };

viewBtn.addEventListener('click', () => {
  const key = state.currentPath.join('/');
  rawPath = rawPath === key ? null : key;
  loadFileHandle(state.currentHandle, state.currentPath);
});

async function renderFile(file, info, pathArr) {
  const formatted = FORMATTED[info.ext];
  const canFormat = formatted && (info.ext === 'html' || file.size <= FORMAT_CAP);
  const raw = rawPath === pathArr.join('/');
  fileMetaEl.textContent = `${info.label} · ${formatSize(file.size)}`;
  fileMetaEl.hidden = false;
  viewBtn.hidden = !canFormat;
  viewBtn.textContent = raw ? formatted : info.ext === 'html' ? 'Source' : 'Raw';
  contentWrapper.classList.toggle('fill', Boolean(canFormat) && !raw && info.ext === 'html');

  if (info.ext === 'md') {
    await renderMarkdown(await file.text(), { mode: 'folder' });
    await resolveImages(pathArr);
    return;
  }
  if (canFormat && !raw) {
    const text = await file.text();
    if (info.ext === 'html') await renderHtml(text, pathArr);
    else if (info.ext === 'csv' || info.ext === 'tsv') renderTable(text, info.ext === 'csv' ? ',' : '\t');
    else renderCode(prettyJson(text, info.ext === 'jsonl'), 'json');
  } else {
    await renderText(file, info.lang);
  }
  buildToc();
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
      if (isRelativeLink(href)) return `<a href="#" data-md-link="${url}"${titleAttr}>${text}</a>`;
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

  // Highlight fenced code
  bodyEl.querySelectorAll('pre > code[class^="language-"]').forEach((el) => {
    if (hljs.getLanguage(el.className.slice(9))) hljs.highlightElement(el);
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

async function renderText(file, lang) {
  const capped = file.size > TEXT_CAP;
  const code = renderCode(await (capped ? file.slice(0, TEXT_CAP) : file).text(), lang);
  if (!capped) return;

  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = `Showing the first ${TEXT_CAP / 1024} KB of ${Math.ceil(file.size / 1024)} KB. Show all`;
  btn.addEventListener('click', async () => {
    setCode(code, await file.text(), lang);
    btn.remove();
  });
  bodyEl.append(btn);
}

function renderCode(text, lang) {
  const code = document.createElement('code');
  setCode(code, text, lang);
  const pre = document.createElement('pre');
  pre.append(code);
  bodyEl.replaceChildren(pre);
  return code;
}

function setCode(el, text, lang) {
  if (lang && hljs.getLanguage(lang) && text.length <= 2 * FORMAT_CAP) {
    el.innerHTML = hljs.highlight(text, { language: lang, ignoreIllegals: true }).value; // output is escaped
  } else {
    el.textContent = text;
  }
}

/** CSV or TSV as a table; the first row is the header. */
function renderTable(text, delim) {
  const [head = [], ...rows] = parseDelimited(text, delim);
  const tr = (cells, tag) => {
    const row = document.createElement('tr');
    for (const cell of cells) row.append(Object.assign(document.createElement(tag), { textContent: cell }));
    return row;
  };
  const table = document.createElement('table');
  table.createTHead().append(tr(head, 'th'));
  table.createTBody().append(...rows.map((r) => tr(r, 'td')));
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  wrap.append(table);
  bodyEl.replaceChildren(wrap);
}

/**
 * An HTML file in a sandboxed frame (html-frame.html): its scripts run, but with no access to the
 * extension or the folder. Relative stylesheets, scripts and images are read from the folder first.
 */
async function renderHtml(text, pathArr) {
  const html = await inlineResources(text, pathArr);
  const frame = document.createElement('iframe');
  frame.className = 'html-frame';
  frame.title = pathArr.at(-1);
  frame.sandbox = 'allow-scripts allow-popups allow-popups-to-escape-sandbox';
  frame.addEventListener('load', () => frame.contentWindow.postMessage(html, '*'), { once: true });
  frame.src = 'html-frame.html';
  bodyEl.replaceChildren(frame);
}

const dataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

async function inlineResources(html, filePath) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // parsing runs nothing
  for (const el of doc.querySelectorAll('link[rel~="stylesheet"][href]')) {
    const file = await fileAt(filePath, el.getAttribute('href'));
    if (file) el.replaceWith(Object.assign(doc.createElement('style'), { textContent: await file.text() }));
  }
  for (const el of doc.querySelectorAll('script[src]')) {
    const file = await fileAt(filePath, el.getAttribute('src'));
    if (!file) continue;
    el.textContent = (await file.text()).replaceAll('</script', '<\\/script');
    el.removeAttribute('src');
  }
  for (const el of doc.querySelectorAll('img[src], source[src]')) {
    const file = await fileAt(filePath, el.getAttribute('src'));
    if (file) el.src = await dataUrl(file);
  }
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
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

/** The file in the open folder that a relative reference points at (image, stylesheet, script), or null. */
async function fileAt(filePath, ref) {
  if (!ref || !isRelativeLink(ref) || !state.rootHandle) return null;
  try {
    return await (await navigateToHandle(state.rootHandle, resolvePathArray(filePath, ref))).getFile();
  } catch {
    return null; // not found: the reference stays as written
  }
}

/** Folder mode: point relative images at blob URLs read from the folder. */
async function resolveImages(filePath) {
  for (const img of bodyEl.querySelectorAll('img[src]')) {
    const file = await fileAt(filePath, img.getAttribute('src'));
    if (!file) continue;
    const url = URL.createObjectURL(file);
    blobUrls.push(url);
    img.src = url;
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
