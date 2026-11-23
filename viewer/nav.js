/**
 * nav.js
 * Back and Forward buttons for the file history (openPath pushes one entry per file).
 * Chrome's own Alt+←/→ and ⌘[ / ⌘] walk the same entries.
 */
import { navGroup, MAC } from './state.js';

const back = document.getElementById('back-btn');
const forward = document.getElementById('forward-btn');
back.title = 'Back (' + (MAC ? '⌘[' : 'Alt ←') + ')';
forward.title = 'Forward (' + (MAC ? '⌘]' : 'Alt →') + ')';

/** A history entry that shows a file of this viewer page: not the page the tab came from, not the empty root. */
const isFileEntry = (e) => {
  if (!e) return false;
  const u = new URL(e.url);
  return u.pathname === location.pathname && u.search === location.search && u.hash.length > 1;
};

function update() {
  const all = navigation.entries();
  const i = navigation.currentEntry.index;
  back.disabled = !isFileEntry(all[i - 1]);
  forward.disabled = !isFileEntry(all[i + 1]);
}

back.addEventListener('click', () => history.back());
forward.addEventListener('click', () => history.forward());
navigation.addEventListener('currententrychange', update);
update();
