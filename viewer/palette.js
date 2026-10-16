/**
 * palette.js
 * Quick open: search every file by path; with an empty search, list the files opened last.
 */
import { state, pref, quickBtn, MAC } from './state.js';
import { searchFiles, pushRecent, recentFiles } from './core.js';
import { openPath } from './reader.js';

const RECENT_MAX = 8;
const paletteEl = document.getElementById('palette');
const paletteInput = document.getElementById('palette-input');
const paletteList = document.getElementById('palette-list');
let paletteHits = [];
let paletteActive = 0;

quickBtn.querySelector('kbd').textContent = MAC ? '⌘K' : 'Ctrl K';
quickBtn.addEventListener('click', openPalette);
paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
paletteEl.addEventListener('click', (e) => {
  if (e.target === paletteEl) paletteEl.close(); // click on the backdrop
});
paletteList.addEventListener('click', (e) => {
  const row = e.target.closest('li[data-i]');
  if (row) choosePalette(Number(row.dataset.i));
});
paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!paletteHits.length) return;
    paletteActive = (paletteActive + (e.key === 'ArrowDown' ? 1 : -1) + paletteHits.length) % paletteHits.length;
    markPalette();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    choosePalette(paletteActive);
  }
});

export function openPalette() {
  if (!state.rootHandle || paletteEl.open) return;
  paletteInput.value = '';
  renderPalette('');
  paletteEl.showModal();
}

function renderPalette(query) {
  paletteHits = query.trim() ? searchFiles(state.allFiles, query) : recentList();
  paletteActive = 0;
  const rows = paletteHits.map((file, i) => {
    const li = document.createElement('li');
    li.id = 'palette-opt-' + i;
    li.dataset.i = i;
    li.setAttribute('role', 'option');
    const name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = file.name;
    const dir = document.createElement('span');
    dir.className = 'p-dir';
    dir.textContent = file.path.slice(1, -1).join('/');
    li.append(name, dir);
    return li;
  });
  if (!rows.length) {
    const empty = document.createElement('li');
    empty.className = 'p-empty';
    empty.textContent = query.trim() ? 'No file matches "' + query.trim() + '".' : 'Type part of a file or folder name.';
    rows.push(empty);
  }
  paletteList.replaceChildren(...rows);
  markPalette();
}

function markPalette() {
  paletteInput.removeAttribute('aria-activedescendant');
  paletteList.querySelectorAll('li[data-i]').forEach((li, i) => {
    const on = i === paletteActive;
    li.setAttribute('aria-selected', String(on));
    if (!on) return;
    paletteInput.setAttribute('aria-activedescendant', li.id);
    li.scrollIntoView({ block: 'nearest' });
  });
}

function choosePalette(i) {
  const file = paletteHits[i];
  if (!file) return;
  paletteEl.close();
  openPath(file.path, 'push');
}

const recentKey = (folderId) => 'recent:' + folderId;
const relOf = (pathArr) => pathArr.slice(1).join('/');
const readRecent = () => JSON.parse(pref.get(recentKey(state.currentFolder.id)) || '[]');

function recentList() {
  return recentFiles(readRecent(), relOf(state.currentPath), state.allFiles);
}

export function rememberRecent(pathArr) {
  pref.set(recentKey(state.currentFolder.id), JSON.stringify(pushRecent(readRecent(), relOf(pathArr), RECENT_MAX)));
}

export function forgetRecent(folderId) {
  pref.remove(recentKey(folderId));
}
