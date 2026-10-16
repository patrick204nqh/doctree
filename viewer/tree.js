/**
 * tree.js
 * The sidebar: the folder tree, the path filter, resizing, and rescans that pick up
 * files added, renamed or removed on disk.
 */
import { state, treeEl, sidebar, mainEl, resizeHandle } from './state.js';
import { icon, textSpan, ICON_FOLDER, ICON_FILE } from './dom.js';
import { buildTree, flatten, signature, findIndex, splitName, EXT_LABEL } from './core.js';
import { setTreeShown } from './settings.js';
import { openPath } from './reader.js';

const RESCAN_MS = 15000;
const ICON_COLLAPSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5l4 3.5 4-3.5M4 13.5L8 10l4 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_REVEAL   = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
const ICON_REFRESH  = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const filterEl = document.getElementById('filter');
let treeSig = ''; // paths of the shown files, to tell whether a rescan found a change
let scanning = false;
let lastScanEnd = 0;
let rescansOn = false;

/* ── Sidebar resize ─────────────────────────────────────────────────────── */
let isResizing = false;
resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  document.body.style.cursor = 'col-resize';
  e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const newWidth = Math.max(160, Math.min(480, e.clientX - mainEl.getBoundingClientRect().left));
  sidebar.style.width = newWidth + 'px';
});
document.addEventListener('mouseup', () => {
  isResizing = false;
  document.body.style.cursor = '';
});

/* ── Filter the tree by path ────────────────────────────────────────────── */
filterEl.addEventListener('input', () => {
  const term = filterEl.value.trim().toLowerCase();
  treeEl.querySelectorAll('li').forEach((li) => { li.hidden = false; });
  if (!term) return;
  treeEl.querySelectorAll('.tree-file').forEach((btn) => {
    btn.closest('li').hidden = !btn.dataset.search.includes(term);
  });
  // Innermost folders first: a folder stays only if one of its children stays
  [...treeEl.querySelectorAll('details')].reverse().forEach((d) => {
    const keep = d.querySelector(':scope > ul > li:not([hidden])') !== null;
    d.closest('li').hidden = !keep;
    d.open = keep;
  });
});

function clearFilter() {
  filterEl.value = '';
  filterEl.dispatchEvent(new Event('input'));
}

/* ── Render ─────────────────────────────────────────────────────────────── */
export function renderTree(rootNode) {
  treeEl.innerHTML = '';
  filterEl.value = '';
  state.allFiles = flatten(rootNode);
  treeSig = signature(state.allFiles);
  if (!rootNode.children.length) {
    treeEl.textContent = `No supported files found (${EXT_LABEL}).`;
    return;
  }
  // Header: folder name, then tools to collapse everything or find the open file
  const head = document.createElement('div');
  head.className = 'tree-head';
  head.append(
    textSpan('tree-root-label', rootNode.name),
    treeTool(ICON_COLLAPSE, 'Collapse all folders', collapseAll),
    treeTool(ICON_REVEAL, 'Show the open file in the tree', revealCurrent),
    treeTool(ICON_REFRESH, 'Rescan the folder for new files', () => rescan(true)),
  );
  treeEl.appendChild(head);
  treeEl.appendChild(buildUL(rootNode.children));
}

function buildUL(children) {
  const ul = document.createElement('ul');
  ul.className = 'tree-list';

  for (const child of children) {
    const li = document.createElement('li');

    if (child.type === 'dir') {
      if (!child.children.length) continue; // skip empty dirs
      const details = document.createElement('details');
      details.dataset.path = child.path.join('/');
      const summary = document.createElement('summary');
      summary.className = 'tree-dir';
      summary.title = child.name;
      summary.append(textSpan('chev', ''), icon(ICON_FOLDER), textSpan('name', child.name));
      summary.addEventListener('click', (e) => onDirClick(e, details, child));
      details.append(summary, buildUL(child.children));
      li.appendChild(details);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tree-file';
      const [stem, ext] = splitName(child.name);
      btn.append(icon(ICON_FILE), textSpan('name', stem), textSpan('ext', ext));
      btn.title = child.path.join('/');
      btn.dataset.path = JSON.stringify(child.path);
      btn.dataset.search = child.path.slice(1).join('/').toLowerCase();
      btn.addEventListener('click', () => openPath(child.path, 'push'));
      li.appendChild(btn);
    }

    ul.appendChild(li);
  }
  return ul;
}

/** Name click opens the folder's entry file and expands it; the chevron only expands or collapses. */
function onDirClick(e, details, node) {
  e.preventDefault();
  const index = findIndex(node.children);
  const shown = index && index.path.join('/') === state.currentPath.join('/');
  if (index && !shown && !e.target.closest('.chev')) {
    details.open = true;
    openPath(index.path, 'push');
  } else {
    details.open = !details.open;
  }
}

function treeTool(svg, label, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tree-tool';
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.append(icon(svg));
  btn.addEventListener('click', onClick);
  return btn;
}

function collapseAll() {
  clearFilter();
  treeEl.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
}

function revealCurrent() {
  clearFilter();
  highlightActiveByPath(state.currentPath);
}

/** Expand a folder in the tree (showing the tree if hidden) and scroll to it. */
export function revealFolder(dir) {
  clearFilter();
  setTreeShown(true);
  const key = dir.join('/');
  const d = [...treeEl.querySelectorAll('details')].find((x) => x.dataset.path === key);
  if (!d) { // the root has no folder row
    sidebar.scrollTop = 0;
    return;
  }
  for (let x = d; x; x = x.parentElement.closest('details')) x.open = true;
  d.scrollIntoView({ block: 'nearest' });
}

export function highlightActiveByPath(pathArr) {
  const key = JSON.stringify(pathArr);
  document.querySelectorAll('.tree-file').forEach((btn) => {
    const active = btn.dataset.path === key;
    btn.classList.toggle('active', active);
    if (!active) return;
    for (let d = btn.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
    btn.scrollIntoView({ block: 'nearest' });
  });
}

/* ── Rescan ─────────────────────────────────────────────────────────────── */
export function startRescans() {
  if (rescansOn) return;
  rescansOn = true;
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) rescan();
  });
  window.addEventListener('focus', () => rescan());
  setTimeout(rescanLoop, RESCAN_MS);
}

async function rescanLoop() {
  const started = performance.now();
  if (!document.hidden) await rescan();
  // A slow scan (a huge folder) waits longer, so the loop stays cheap
  setTimeout(rescanLoop, Math.max(RESCAN_MS, (performance.now() - started) * 20));
}

async function rescan(force) {
  const root = state.rootHandle;
  if (!root || scanning || (!force && performance.now() - lastScanEnd < 2000)) return;
  scanning = true;
  try {
    const tree = await buildTree(root, [root.name]);
    if (root !== state.rootHandle) return; // the reader switched folders meanwhile
    if (signature(flatten(tree)) === treeSig) return;
    redrawTree(tree);
  } catch (err) {
    console.warn('[Doctree] rescan failed:', err);
  } finally {
    scanning = false;
    lastScanEnd = performance.now();
  }
}

/** Redraw after a change, keeping folders open, the scroll position and the filter. */
function redrawTree(tree) {
  const open = new Set([...treeEl.querySelectorAll('details[open]')].map((d) => d.dataset.path));
  const top = sidebar.scrollTop;
  const term = filterEl.value;
  renderTree(tree);
  treeEl.querySelectorAll('details').forEach((d) => { d.open = open.has(d.dataset.path); });
  highlightActiveByPath(state.currentPath);
  sidebar.scrollTop = top;
  if (term) {
    filterEl.value = term;
    filterEl.dispatchEvent(new Event('input'));
  }
}
