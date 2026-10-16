/**
 * settings.js
 * One panel for every saved preference, the file-tree toggle, and the keyboard shortcuts.
 */
import { mainEl, treeToggleBtn, modeSwitch, state, pref } from './state.js';
import { setupMenu, typing } from './dom.js';
import { setToc, tocOn } from './outline.js';
import { renderCrumbs } from './crumbs.js';
import { reloadCurrent } from './reader.js';
import { openPalette } from './palette.js';

const settingsBtn = document.getElementById('settings-btn');
const settingsMenu = document.getElementById('settings-menu');

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
};

setupMenu(settingsMenu, settingsBtn, showSettings, settingsBtn);
settingsMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pref]');
  if (b) apply(b.dataset.pref, b.dataset.value);
});

function apply(name, value) {
  PREFS[name].set(value);
  showSettings();
}

function showSettings() {
  settingsMenu.querySelectorAll('[data-pref]').forEach((b) => {
    b.setAttribute('aria-pressed', String(PREFS[b.dataset.pref].get() === b.dataset.value));
  });
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
    case 'o': apply('outline', tocOn() ? 'off' : 'on'); break;
    case 'w': apply('width', PREFS.width.get() === 'full' ? 'contained' : 'full'); break;
    case 'r': if (!modeSwitch.hidden) modeSwitch.querySelector('[aria-pressed="false"]').click(); break;
  }
});
