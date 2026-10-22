/**
 * links.js
 * Links to trusted sites (a list the reader edits in Settings): hovering a link shows a card read from that site's
 * public API, and a video link alone on its line becomes a thumbnail card. Each is a request to that site, made
 * because the reader opened a file with such a link or hovered one; nothing else goes out.
 */
import { bodyEl, pref, state } from './state.js';
import { DEFAULT_SITES, parseSites, previewFor, cardText, resolveLink, fileInfo } from './core.js';

export const getSites = () => {
  const saved = pref.get('sites');
  return saved == null ? DEFAULT_SITES : parseSites(saved);
};

export function setSites(text) {
  const sites = parseSites(text);
  if (sites.join() === DEFAULT_SITES.join()) pref.remove('sites');
  else pref.set('sites', sites.join('\n'));
}

/** Mark the trusted links under root: a label after each, card data for hovering, a thumbnail card for a video link alone in its paragraph. A link to a file in the open folder gets a card from the folder's file list. */
export function decorateLinks(root) {
  for (const a of root.querySelectorAll('a[data-md-link]')) {
    const href = a.dataset.mdLink;
    const hit = resolveLink(state.allFiles, state.currentPath, href);
    const name = hit?.path.at(-1);
    a.dataset.info = JSON.stringify(hit
      ? { title: name, text: hit.path.slice(1).join('/'), meta: `${fileInfo(name).label} · in this folder` }
      : { title: href, text: '', meta: 'Not found in this folder' });
  }
  const sites = getSites();
  for (const a of root.querySelectorAll('a[href^="http"]')) {
    const p = previewFor(a.getAttribute('href'), sites);
    if (!p) continue;
    a.classList.add('trusted');
    a.dataset.site = p.site;
    if (p.info) a.dataset.info = JSON.stringify(p.info);
    if (!p.card) continue;
    a.dataset.card = p.card.url;
    a.dataset.kind = p.card.kind;
    if (p.video && a.parentElement.tagName === 'P' && a.parentElement.childNodes.length === 1) videoCard(a);
  }
}

/** The link becomes a thumbnail with title and channel; it still opens the video in a new tab. Fails quietly: the plain link stays. */
async function videoCard(a) {
  const data = await cardFor(a);
  if (!data?.image || !a.isConnected) return;
  const card = document.createElement('a');
  card.className = 'video-card';
  card.href = a.href;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  const img = document.createElement('img');
  img.src = data.image;
  img.alt = '';
  img.loading = 'lazy';
  const title = document.createElement('b');
  title.textContent = data.title;
  const meta = document.createElement('small');
  meta.textContent = data.meta || a.dataset.site;
  card.append(img, title, meta);
  a.replaceWith(card);
}

/* ── Hover card ─────────────────────────────────────────────────────────── */

const HOVER_MS = 350;
const TEXT_MAX = 280;
const cache = new Map(); // API url → { title, text, meta }, or null when the request failed (not retried: GitHub allows 60 a hour)
let cardEl = null;
let timer = 0;
const CARD_LINK = 'a[data-card], a[data-info]';

for (const [on, off] of [['mouseover', 'mouseout'], ['focusin', 'focusout']]) {
  bodyEl.addEventListener(on, (e) => {
    const a = e.target.closest(CARD_LINK);
    if (!a) return;
    clearTimeout(timer);
    timer = setTimeout(() => showCard(a), HOVER_MS);
  });
  bodyEl.addEventListener(off, (e) => {
    if (!e.target.closest(CARD_LINK)) return;
    clearTimeout(timer);
    hideCard();
  });
}
document.addEventListener('scroll', hideCard, true);

async function cardFor(a) {
  if (a.dataset.info) return JSON.parse(a.dataset.info); // read from the link itself: nothing to fetch
  const url = a.dataset.card;
  if (!cache.has(url)) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      cache.set(url, cardText(a.dataset.kind, await res.json()));
    } catch (err) {
      console.warn('[Doctree] link card:', url, err);
      cache.set(url, null);
    }
  }
  return cache.get(url);
}

async function showCard(a) {
  const data = await cardFor(a);
  if (!data || !a.isConnected || !(a.matches(':hover') || a.matches(':focus'))) return; // gone, or the reader moved on
  if (!cardEl) {
    cardEl = document.createElement('div');
    cardEl.id = 'link-card';
    cardEl.setAttribute('role', 'tooltip');
    document.body.append(cardEl);
  }
  const title = document.createElement('b');
  title.textContent = data.title;
  const parts = [title];
  if (data.text) {
    const text = document.createElement('p');
    text.textContent = data.text.length > TEXT_MAX ? data.text.slice(0, TEXT_MAX) + '…' : data.text;
    parts.push(text);
  }
  if (data.meta) {
    const meta = document.createElement('small');
    meta.textContent = data.meta;
    parts.push(meta);
  }
  cardEl.replaceChildren(...parts);
  cardEl.hidden = false;

  const r = a.getBoundingClientRect();
  const { width, height } = cardEl.getBoundingClientRect();
  const below = r.bottom + 6 + height <= innerHeight;
  cardEl.style.left = Math.max(8, Math.min(r.left, innerWidth - width - 8)) + 'px';
  cardEl.style.top = Math.max(8, below ? r.bottom + 6 : r.top - height - 6) + 'px';
}

function hideCard() {
  if (cardEl) cardEl.hidden = true;
}
