/**
 * settings.js
 * One panel for every saved preference, the file-tree toggle, and the keyboard shortcuts.
 */
import { mainEl, treeToggleBtn, modeSwitch, state, pref } from './state.js';
import { setupMenu, typing } from './dom.js';
import { setToc, tocOn } from './outline.js';
import { renderCrumbs } from './crumbs.js';
import { reloadCurrent } from './reader.js';
import { focusTableFilter } from './table.js';
import { openPalette } from './palette.js';
import { getSites, setSites } from './links.js';
import { parseSites } from './core.js';

const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');
const sitesEl = document.getElementById('s-sites');        // the badges
const siteInput = document.getElementById('s-site-input'); // where a site is typed

export function isDark() {
  return document.documentElement.dataset.theme === 'dark';
}

// theme.js sets theme and width before first paint; each setter saves its choice.
const PREFS = {
  theme:   { get: () => (isDark() ? 'dark' : 'light'), set: setTheme },
  width:   { get: () => document.documentElement.dataset.width, set: setWidth },
  crumbs:  { get: () => (pref.on('crumbs', true) ? 'on' : 'off'), set: (v) => setCrumbs(v === 'on') },
  outline: { get: () => (tocOn() ? 'on' : 'off'), set: (v) => setToc(v === 'on') },
  tree:    { get: () => mainEl.dataset.tree, set: (v) => setTreeShown(v === 'on', true) },
  rows:    { get: () => pref.get('rows') ?? '500', set: setRows },
  wrap:    { get: () => (pref.on('table-wrap', false) ? 'on' : 'off'), set: (v) => setWrapCells(v === 'on') },
};

setupMenu(settingsMenu, settingsBtn, showSettings, settingsBtn);
settingsMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pref]');
  if (b) apply(b.dataset.pref, b.dataset.value);
});

// Trusted sites are badges: type a domain (then Enter, a space or a comma; a pasted list works too) to add, × to remove.
const saveSites = (sites) => {
  setSites(sites.join('\n'));
  renderSites();
  if (state.currentHandle) reloadCurrent(); // redraws the open file with the new list
};
const addSites = () => {
  const added = parseSites(siteInput.value);
  siteInput.value = '';
  if (added.length) saveSites([...getSites(), ...added]);
};
siteInput.addEventListener('input', () => { if (/[\s,]/.test(siteInput.value)) addSites(); });
siteInput.addEventListener('change', addSites); // Enter, or leaving the box
sitesEl.addEventListener('click', (e) => {
  const remove = e.target.closest('button[data-site]');
  if (remove) { saveSites(getSites().filter((site) => site !== remove.dataset.site)); siteInput.focus(); }
  else if (e.target === sitesEl) siteInput.focus();
});

function renderSites() {
  sitesEl.querySelectorAll('.s-chip').forEach((chip) => chip.remove());
  for (const site of getSites()) {
    const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: '×', ariaLabel: `Remove ${site}` });
    remove.dataset.site = site;
    const chip = document.createElement('span');
    chip.className = 's-chip';
    chip.append(site, remove);
    siteInput.before(chip);
  }
}

function apply(name, value) {
  PREFS[name].set(value);
  showSettings();
}

function showSettings() {
  settingsMenu.querySelectorAll('[data-pref]').forEach((b) => {
    b.setAttribute('aria-pressed', String(PREFS[b.dataset.pref].get() === b.dataset.value));
  });
  renderSites();
}

function setRows(rows) {
  pref.set('rows', rows);
  if (state.currentHandle) reloadCurrent(); // redraws an open table with the new page size
}

function setWrapCells(on) {
  pref.setOn('table-wrap', on);
  if (state.currentHandle) reloadCurrent(); // redraws an open table
}

function setTheme(theme) {
  if (theme === PREFS.theme.get()) return;
  document.documentElement.dataset.theme = theme;
  pref.set('theme', theme);
  if (state.currentHandle) reloadCurrent(); // redraws Mermaid in the new theme
}

function setWidth(width) {
  document.documentElement.dataset.width = width;
  pref.set('width', width);
}

function setCrumbs(on) {
  pref.setOn('crumbs', on);
  renderCrumbs();
}

export function setTreeShown(shown, save) {
  mainEl.dataset.tree = shown ? 'on' : 'off';
  treeToggleBtn.setAttribute('aria-expanded', String(shown));
  if (save) pref.setOn('tree', shown);
  showSettings();
}

const toggleTree = () => setTreeShown(mainEl.dataset.tree === 'off', true);

setTreeShown(pref.on('tree', true));
treeToggleBtn.addEventListener('click', toggleTree);

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    if (!state.rootHandle) return;
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
  switch (e.key) {
    case '\\': if (state.rootHandle) toggleTree(); break;
    case '/': if (focusTableFilter()) e.preventDefault(); break;
    case 'o': apply('outline', tocOn() ? 'off' : 'on'); break;
    case 'w': apply('width', PREFS.width.get() === 'full' ? 'contained' : 'full'); break;
    case 'r': if (!modeSwitch.hidden) modeSwitch.querySelector('[aria-pressed="false"]').click(); break;
  }
});
