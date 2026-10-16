/**
 * crumbs.js
 * The open file's path in the toolbar. Hover a folder to list what is in it; hover a
 * subfolder to open its list beside it.
 */
import { state, fileNameEl, pref } from './state.js';
import { icon, textSpan, menuArrows, placeMenu, ICON_FOLDER, ICON_FILE } from './dom.js';
import { folderItems, firstFileIn } from './core.js';
import { openPath } from './reader.js';
import { revealFolder } from './tree.js';

const crumbMenu = document.getElementById('crumb-menu');
const crumbsEl = document.getElementById('crumbs');
let crumbTimer = 0;
let crumbFor = null; // the crumb the open menu belongs to
const later = (ms, fn) => { clearTimeout(crumbTimer); crumbTimer = setTimeout(fn, ms); };

crumbsEl.addEventListener('click', (e) => {
  const b = e.target.closest('.crumb');
  if (!b) return;
  hideCrumbMenu();
  openFolderPath(crumbDir(b));
});
crumbsEl.addEventListener('mouseover', (e) => {
  const b = e.target.closest('.crumb');
  if (b) later(crumbMenu.matches(':popover-open') ? 0 : 150, () => showCrumbMenu(b));
  else later(250, hideCrumbMenu);
});
crumbsEl.addEventListener('mouseleave', () => later(250, hideCrumbMenu));
crumbsEl.addEventListener('keydown', (e) => {
  const b = e.target.closest('.crumb');
  if (!b || e.key !== 'ArrowDown') return;
  e.preventDefault();
  showCrumbMenu(b, true);
});
const crumbMenus = [crumbMenu]; // level 0 is in the page; each deeper level is a flyout made on demand
wireCrumbMenu(crumbMenu, 0);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.crumb-menu, .crumb')) hideCrumbMenu();
});

function crumbDir(b) {
  return state.currentPath.slice(0, Number(b.dataset.depth) + 1);
}

function wireCrumbMenu(menu, level) {
  menu.addEventListener('mouseleave', () => later(250, hideCrumbMenu));
  // mouseover fires before mouseenter, so the pointer entering the menu is handled here
  menu.addEventListener('mouseover', (e) => {
    const it = e.target.closest('[data-path]');
    if (!it) return clearTimeout(crumbTimer);
    if (it.dataset.type === 'dir') later(150, () => openFlyout(level, it));
    else later(150, () => closeCrumbMenus(level + 1));
  });
  menu.addEventListener('click', (e) => {
    const it = e.target.closest('[data-path]');
    if (!it) return;
    const path = JSON.parse(it.dataset.path);
    hideCrumbMenu();
    if (it.dataset.type === 'dir') openFolderPath(path);
    else openPath(path, 'push');
  });
  menu.addEventListener('keydown', (e) => {
    const it = e.target.closest('[data-path]');
    if (e.key === 'Escape') {
      const b = crumbFor;
      hideCrumbMenu();
      b?.focus();
    } else if (e.key === 'ArrowRight' && it?.dataset.type === 'dir') {
      e.preventDefault();
      openFlyout(level, it, true);
    } else if (e.key === 'ArrowLeft' && level > 0) {
      e.preventDefault();
      closeCrumbMenus(level);
      menu.opener?.focus();
    }
  });
  menuArrows(menu);
}

function crumbLevel(level) {
  if (!crumbMenus[level]) {
    const m = document.createElement('div');
    m.className = 'menu crumb-menu';
    m.setAttribute('popover', 'manual');
    m.setAttribute('role', 'menu');
    m.setAttribute('aria-label', 'Folder contents');
    document.body.append(m);
    wireCrumbMenu(m, level);
    crumbMenus[level] = m;
  }
  return crumbMenus[level];
}

function crumbItem(it) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('role', 'menuitem');
  btn.dataset.type = it.type;
  btn.dataset.path = JSON.stringify(it.path);
  if (it.path.every((p, i) => state.currentPath[i] === p)) btn.setAttribute('aria-current', 'true'); // on the way to the open file
  btn.append(icon(it.type === 'dir' ? ICON_FOLDER : ICON_FILE), textSpan('name', it.name));
  if (it.type === 'dir') {
    btn.setAttribute('aria-haspopup', 'menu');
    btn.append(textSpan('more', '›'));
  }
  return btn;
}

/** Fill and show one level with a folder's items; null when the folder has none. */
function showCrumbLevel(level, dir, opener) {
  const items = folderItems(state.allFiles, dir);
  if (!items.length) return null;
  const menu = crumbLevel(level);
  menu.opener = opener;
  menu.replaceChildren(...items.map(crumbItem));
  if (!menu.matches(':popover-open')) menu.showPopover();
  closeCrumbMenus(level + 1);
  return menu;
}

function showCrumbMenu(b, focusFirst) {
  crumbFor = b;
  const menu = showCrumbLevel(0, crumbDir(b), b);
  if (!menu) return hideCrumbMenu();
  placeMenu(menu, b);
  crumbsEl.querySelectorAll('.crumb').forEach((c) => c.setAttribute('aria-expanded', String(c === b)));
  if (focusFirst) menu.querySelector('button')?.focus();
}

/** Open a subfolder's list beside its row; it flips to the left edge when there is no room. */
function openFlyout(level, item, focusFirst) {
  const open = crumbMenus[level + 1];
  if (open?.opener === item && open.matches(':popover-open')) {
    if (focusFirst) open.querySelector('button')?.focus();
    return;
  }
  const menu = showCrumbLevel(level + 1, JSON.parse(item.dataset.path), item);
  if (!menu) return;
  const r = item.getBoundingClientRect();
  const left = r.right + 2 + menu.offsetWidth > innerWidth - 8 ? r.left - menu.offsetWidth - 2 : r.right + 2;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top = Math.max(8, Math.min(r.top - 5, innerHeight - menu.offsetHeight - 8)) + 'px';
  if (focusFirst) menu.querySelector('button')?.focus();
}

function closeCrumbMenus(from) {
  for (let i = from; i < crumbMenus.length; i++) {
    if (crumbMenus[i].matches(':popover-open')) crumbMenus[i].hidePopover();
  }
}

function hideCrumbMenu() {
  clearTimeout(crumbTimer);
  crumbFor = null;
  closeCrumbMenus(0);
  crumbsEl.querySelectorAll('.crumb').forEach((c) => c.setAttribute('aria-expanded', 'false'));
}

/** A folder opens its first file in tree order (the entry file when it has one). */
function openFolderPath(dir) {
  const first = firstFileIn(state.allFiles, dir);
  if (first && first.path.join('/') !== state.currentPath.join('/')) openPath(first.path, 'push');
  else revealFolder(dir);
}

export function renderCrumbs() {
  hideCrumbMenu();
  const { currentPath } = state;
  const show = pref.on('crumbs', true) && state.rootHandle !== null && currentPath.length > 0;
  crumbsEl.hidden = !show;
  fileNameEl.hidden = show;
  if (!show) return;
  const last = currentPath.length - 1;
  const parts = [];
  currentPath.forEach((name, i) => {
    if (i) {
      const sep = textSpan('crumb-sep', '/');
      sep.setAttribute('aria-hidden', 'true');
      parts.push(sep);
    }
    if (i === last) {
      const cur = textSpan('crumb-cur', name);
      cur.setAttribute('aria-current', 'page');
      parts.push(cur);
    } else {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'crumb';
      b.setAttribute('aria-haspopup', 'menu');
      b.setAttribute('aria-expanded', 'false');
      b.dataset.depth = i;
      b.title = 'Open ' + currentPath.slice(0, i + 1).join('/');
      b.textContent = name;
      parts.push(b);
    }
  });
  crumbsEl.replaceChildren(...parts);
}
