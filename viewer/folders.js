/**
 * folders.js
 * Pick, remember and switch folders (handles saved in IndexedDB), and copy a file's path.
 */
import {
  state, bodyEl, fileNameEl, fileMetaEl, modeSwitch, copyContentBtn, sidebar, treeEl, copyGroup, resizeHandle,
  treeToggleBtn, quickBtn, MAC,
} from './state.js';
import { textSpan, menuItem, setupMenu, flash } from './dom.js';
import { buildTree, findIndex, hashToPath, parseBase } from './core.js';
import { renderCrumbs } from './crumbs.js';
import { renderTree, startRescans } from './tree.js';
import { openPath, currentText } from './reader.js';
import { forgetRecent } from './palette.js';

const FOLDERS_MAX = 8;
const openFolderBtn = document.getElementById('open-folder-btn');
const foldersBtn = document.getElementById('folders-btn');
const foldersMenu = document.getElementById('folders-menu');
const copyMenuBtn = document.getElementById('copy-menu-btn');
const copyMenu = document.getElementById('copy-menu');

setupMenu(foldersMenu, foldersBtn, fillFoldersMenu);
setupMenu(copyMenu, copyMenuBtn, fillCopyMenu);

/* ── Copy: the file's text from the button, its path from the menu ──────── */
copyContentBtn.addEventListener('click', () => copy('content'));
copyMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-copy]');
  if (!item) return;
  copyMenu.hidePopover();
  copy(item.dataset.copy);
});

function relPath() {
  return state.currentPath.slice(1).join('/');
}

function absPath() {
  return state.currentFolder?.base ? state.currentFolder.base + '/' + relPath() : '';
}

async function copy(kind) {
  const text = kind === 'content' ? await currentText() : kind === 'absolute' ? absPath() : relPath();
  if (!text && kind !== 'content') { // the folder's location on disk is not known yet
    copyMenu.showPopover();
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('[Doctree] copy failed:', err);
    return;
  }
  flash(copyContentBtn);
}

function fillCopyMenu() {
  const { rootHandle, currentFolder } = state;
  const abs = menuItem('Absolute path', absPath() || 'Set the folder location below first', { copy: 'absolute' });
  abs.disabled = !absPath();

  const input = document.createElement('input');
  input.id = 'base-input';
  input.type = 'text';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.placeholder = '/Users/you/' + rootHandle.name;
  input.value = currentFolder.base;
  input.autofocus = !currentFolder.base;
  const save = document.createElement('button');
  save.type = 'submit';
  save.textContent = 'Save';
  const row = document.createElement('div');
  row.className = 'm-row';
  row.append(input, save);
  const label = document.createElement('label');
  label.htmlFor = 'base-input';
  label.textContent = 'Folder location on disk';
  const error = textSpan('m-error', '');
  const form = document.createElement('form');
  form.className = 'm-form';
  form.append(label, textSpan('m-note', 'Chrome cannot tell where the opened folder lives, so enter it once.'), row, error);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const base = parseBase(input.value);
    if (!base) {
      error.textContent = 'Enter a full path, like /Users/you/' + rootHandle.name;
      return;
    }
    currentFolder.base = base;
    await putFolder(currentFolder);
    await refreshFolders();
    copyMenu.hidePopover();
    copy('absolute');
  });

  copyMenu.replaceChildren(
    menuItem('File content', 'Exact text on disk', { copy: 'content' }),
    abs,
    menuItem('Relative path', relPath(), { copy: 'relative' }),
    document.createElement('hr'),
    form,
  );
}

/* ── Folders: pick, remember, switch ────────────────────────────────────── */
openFolderBtn.addEventListener('click', openFolder);
foldersMenu.addEventListener('click', async (e) => {
  const forget = e.target.closest('[data-forget]');
  if (forget) {
    await forgetFolder(forget.dataset.forget);
    fillFoldersMenu();
    return;
  }
  const open = e.target.closest('[data-open]');
  if (!open) return;
  foldersMenu.hidePopover();
  if (open.dataset.open === 'new') openFolder();
  else openRecent(state.folders.find((f) => f.id === open.dataset.open));
});

function fillFoldersMenu() {
  const rows = state.folders.map((rec) => {
    const item = menuItem(rec.name, rec.base || 'Location not set', { open: rec.id });
    if (rec.id === state.currentFolder?.id) item.firstElementChild.append(textSpan('m-tag', 'open'));
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'm-x';
    x.dataset.forget = rec.id;
    x.title = 'Forget this folder';
    x.setAttribute('aria-label', 'Forget ' + rec.name);
    x.textContent = '×';
    const row = document.createElement('div');
    row.className = 'm-row';
    row.append(item, x);
    return row;
  });
  foldersMenu.replaceChildren(
    ...rows,
    ...(rows.length ? [document.createElement('hr')] : []),
    menuItem('Open another folder…', '', { open: 'new' }),
  );
}

async function openFolder() {
  let handle;
  try {
    handle = await window.showDirectoryPicker({ mode: 'read' });
  } catch (err) {
    if (err.name !== 'AbortError') console.error('[Doctree] openFolder:', err);
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  await showRoot(await adoptFolder(handle));
}

async function openRecent(rec) {
  if (!rec || rec.id === state.currentFolder?.id) return;
  const granted = await rec.handle.queryPermission({ mode: 'read' }) === 'granted'
    || await rec.handle.requestPermission({ mode: 'read' }) === 'granted';
  if (!granted) {
    bodyEl.textContent = 'Doctree needs read access to ' + rec.name + ' to open it.';
    return;
  }
  history.replaceState(null, '', location.pathname + location.search);
  rec.used = Date.now();
  await putFolder(rec);
  await refreshFolders();
  await showRoot(state.folders.find((f) => f.id === rec.id));
}

/** Reuse the saved record when the picked folder is already remembered; keep the newest FOLDERS_MAX. */
async function adoptFolder(handle) {
  let rec;
  for (const saved of state.folders) {
    if (await saved.handle.isSameEntry(handle).catch(() => false)) {
      rec = saved;
      break;
    }
  }
  rec = rec ?? { id: crypto.randomUUID(), name: handle.name, handle, base: '' };
  rec.used = Date.now();
  await putFolder(rec);
  for (const old of state.folders.filter((f) => f.id !== rec.id).slice(FOLDERS_MAX - 1)) await forgetFolder(old.id);
  await refreshFolders();
  return state.folders.find((f) => f.id === rec.id);
}

async function forgetFolder(id) {
  await folderStore('readwrite', (store) => store.delete(id));
  forgetRecent(id);
  await refreshFolders();
}

/** Reopen the most recent folder, or offer a button when Chrome wants a click to grant access again. */
export async function restoreRoot() {
  await refreshFolders();
  const rec = state.folders[0];
  if (!rec) return;
  if (await rec.handle.queryPermission({ mode: 'read' }) === 'granted') {
    await showRoot(rec);
    return;
  }
  // requestPermission needs a click
  const btn = document.createElement('button');
  btn.className = 'btn';
  btn.textContent = 'Reopen ' + rec.name;
  btn.addEventListener('click', async () => {
    if (await rec.handle.requestPermission({ mode: 'read' }) === 'granted') await showRoot(rec);
  });
  bodyEl.replaceChildren(btn);
}

async function showRoot(rec) {
  state.currentFolder = rec;
  state.rootHandle = rec.handle;
  state.currentHandle = null; // nothing is open in the new folder yet
  state.currentPath = [];
  copyGroup.hidden = modeSwitch.hidden = fileMetaEl.hidden = true;
  fileNameEl.textContent = '';
  renderCrumbs();
  treeEl.innerHTML = '<span style="color:var(--muted);font-size:0.8em">Loading…</span>';
  setFolderUi(true);

  let tree;
  try {
    tree = await buildTree(rec.handle, [rec.handle.name]);
  } catch (err) {
    console.warn('[Doctree] cannot read folder:', err);
    state.currentFolder = null;
    state.rootHandle = null;
    setFolderUi(false);
    bodyEl.textContent = 'Could not read ' + rec.name + '. Click Open Folder to pick it again.';
    return;
  }
  renderTree(tree);
  startRescans();

  const fromHash = hashToPath(location.hash, rec.handle.name);
  const start = fromHash ?? findIndex(tree.children)?.path;
  if (start) {
    await openPath(start, fromHash ? null : 'replace');
  } else {
    bodyEl.textContent = 'No index file in ' + rec.name + '. Pick a file from the tree, or press '
      + (MAC ? '⌘K' : 'Ctrl K') + ' to search.';
  }
}

function setFolderUi(on) {
  sidebar.hidden = resizeHandle.hidden = treeToggleBtn.hidden = quickBtn.hidden = !on;
}

/* ── Saved folders (IndexedDB) ──────────────────────────────────────────── */
export async function refreshFolders() {
  try {
    state.folders = (await folderStore('readonly', (store) => store.getAll())).sort((a, b) => b.used - a.used);
  } catch (err) {
    console.warn('[Doctree] cannot read saved folders:', err);
    state.folders = [];
  }
  if (state.currentFolder) state.currentFolder = state.folders.find((f) => f.id === state.currentFolder.id) ?? state.currentFolder;
}

function putFolder(rec) {
  return folderStore('readwrite', (store) => store.put(rec));
}

function folderStore(mode, run) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('doctree', 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (db.objectStoreNames.contains('kv')) db.deleteObjectStore('kv'); // version 1 kept one folder
      if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('folders', mode);
      const req = run(tx.objectStore('folders'));
      tx.oncomplete = () => {
        open.result.close();
        resolve(req.result);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}
