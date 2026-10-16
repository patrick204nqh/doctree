/**
 * outline.js
 * h1–h3 of the open file in a right-hand panel, hidden until asked for.
 */
import { bodyEl, contentWrapper, pref } from './state.js';
import { headingIds } from './core.js';

const tocEl = document.getElementById('toc');
let tocHeads = []; // h1–h3 of the open file, in order

tocEl.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-i]');
  if (!a) return;
  e.preventDefault();
  tocHeads[a.dataset.i].scrollIntoView();
});
contentWrapper.addEventListener('scroll', () => requestAnimationFrame(markToc), { passive: true });

export const tocOn = () => pref.on('toc', false);

export function setToc(on) {
  pref.setOn('toc', on);
  showToc();
}

/** Give every heading an id (targets for in-page #links) and list h1–h3 in the panel. */
export function buildToc() {
  const heads = [...bodyEl.querySelectorAll('h1, h2, h3, h4, h5, h6')];
  const ids = headingIds(heads.map((h) => h.textContent));
  heads.forEach((h, i) => { h.id = ids[i]; });
  tocHeads = heads.filter((h) => h.tagName < 'H4');
  tocEl.replaceChildren(...tocHeads.map((h, i) => {
    const a = document.createElement('a');
    a.href = '#';
    a.dataset.i = i;
    a.className = 'toc-' + h.tagName.toLowerCase();
    a.textContent = h.textContent;
    return a;
  }));
  showToc();
}

function showToc() {
  tocEl.hidden = !(tocOn() && tocHeads.length);
  markToc();
}

function markToc() {
  if (tocEl.hidden) return;
  const top = contentWrapper.getBoundingClientRect().top + 40;
  let cur = 0;
  tocHeads.forEach((h, i) => { if (h.getBoundingClientRect().top <= top) cur = i; });
  tocEl.querySelectorAll('a').forEach((a, i) => a.classList.toggle('active', i === cur));
}
