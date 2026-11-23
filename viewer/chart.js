/**
 * chart.js
 * Draws counts into an element, as a list of horizontal bars (labels stay readable) or as a vertical plot of
 * columns or a line. It knows nothing about tables: it gets points and calls back when one is hovered or picked.
 *
 * A point is { label, n, share, pick }: its name, its count, its share of the filled rows (0 to 1) and
 * whatever the caller wants handed back when the point is picked.
 */
import { niceTicks } from './core.js';

const SVG = 'http://www.w3.org/2000/svg';
const html = (tag, props, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids); return el; };
const svg = (tag, attrs, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  el.append(...kids);
  return el;
};
const pct = (share) => `${share > 0 && share < 0.01 ? '<1' : Math.round(share * 100)}%`;
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** "Item 4 · 12 rows · 3%" */
export const describe = (p) => `${p.label} · ${p.n.toLocaleString()} row${p.n === 1 ? '' : 's'} · ${pct(p.share)}`;

/** One row per point: name, a bar, the count and its share. A row is a button that picks the point. */
export function drawBars(body, points, { onPick }) {
  const widest = Math.max(1, ...points.map((p) => p.n));
  body.replaceChildren(html('ol', { className: 'chart-bars' }, ...points.map((p) => {
    const fill = html('span', { className: 'bar-fill' });
    fill.style.width = `${(p.n / widest) * 100}%`;
    const row = html('button', { type: 'button', className: 'bar-row', title: `${describe(p)}\nShow only these rows` },
      html('span', { className: 'bar-label', textContent: p.label }),
      html('span', { className: 'bar-track' }, fill),
      html('span', { className: 'bar-n', textContent: p.n.toLocaleString() }),
      html('span', { className: 'bar-pct', textContent: pct(p.share) }));
    row.addEventListener('click', () => onPick(p));
    return html('li', {}, row);
  })));
}

/**
 * A vertical plot with a count axis. `type` is "bar" (columns) or "line" (a line with a dot per point).
 * Each point has a full-height hit area, so it is easy to hover, and reachable and pickable by keyboard.
 * `onHover(point)` runs on hover or focus, and `onHover(null)` when it ends.
 */
export function drawPlot(body, points, { type, width, onPick, onHover }) {
  const H = 200;
  const edge = { l: 46, r: 12, t: 10, b: 30 };
  const W = Math.max(320, width);
  const plotW = W - edge.l - edge.r;
  const plotH = H - edge.t - edge.b;
  const ticks = niceTicks(Math.max(...points.map((p) => p.n)));
  const ceiling = ticks.at(-1);
  const y = (n) => edge.t + plotH - (n / ceiling) * plotH;
  const band = plotW / points.length;
  const x = (i) => edge.l + band * (i + 0.5);

  const root = svg('svg', { class: 'plot', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Chart' });
  for (const t of ticks) {
    root.append(
      svg('line', { class: 'plot-grid', x1: edge.l, x2: W - edge.r, y1: y(t), y2: y(t) }),
      svg('text', { class: 'plot-tick', x: edge.l - 6, y: y(t) + 4, 'text-anchor': 'end' }, t.toLocaleString()),
    );
  }
  const every = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 80))); // as many x labels as fit
  points.forEach((p, i) => {
    if (i % every === 0) root.append(svg('text', { class: 'plot-tick', x: x(i), y: H - 10, 'text-anchor': 'middle' }, clip(p.label, 12)));
  });

  let marks;
  if (type === 'line') {
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.n)}`).join(' ');
    root.append(
      svg('path', { class: 'plot-area', d: `${path} L${x(points.length - 1)},${edge.t + plotH} L${x(0)},${edge.t + plotH} Z` }),
      svg('path', { class: 'plot-line', d: path }),
    );
    marks = points.map((p, i) => svg('circle', { class: 'plot-dot', cx: x(i), cy: y(p.n), r: 3.5 }));
  } else {
    const w = Math.min(56, band * 0.7);
    marks = points.map((p, i) => svg('rect', { class: 'plot-bar', x: x(i) - w / 2, y: y(p.n), width: w, height: Math.max(0, edge.t + plotH - y(p.n)), rx: 2 }));
  }
  root.append(...marks);

  points.forEach((p, i) => {
    const hit = svg('rect', {
      class: 'plot-hit', x: edge.l + band * i, y: edge.t, width: band, height: plotH,
      tabindex: 0, role: 'button', 'aria-label': `${describe(p)}. Show only these rows`,
    });
    const on = () => { marks[i].classList.add('is-hot'); onHover(p); };
    const off = () => { marks[i].classList.remove('is-hot'); onHover(null); };
    hit.addEventListener('pointerenter', on);
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('focus', on);
    hit.addEventListener('blur', off);
    hit.addEventListener('click', () => onPick(p));
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p); } });
    root.append(hit);
  });
  body.replaceChildren(root);
}
