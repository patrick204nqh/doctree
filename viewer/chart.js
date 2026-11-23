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
export const pct = (share) => `${share > 0 && share < 0.01 ? '<1' : Math.round(share * 100)}%`;
/** The CSS variable holding a point's colour in a donut or its image: eight series colours, then grey for "Other". */
export const seriesVar = (p, i) => (p.other ? '--series-other' : `--series-${i % 8}`);
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
  const edge = { l: 46, r: 12, t: 22, b: 30 };
  const W = Math.max(320, width);
  const plotW = W - edge.l - edge.r;
  const plotH = H - edge.t - edge.b;
  const ticks = niceTicks(Math.max(...points.map((p) => p.n)));
  const ceiling = ticks.at(-1);
  const y = (n) => edge.t + plotH - (n / ceiling) * plotH;
  const band = plotW / points.length;
  const x = (i) => edge.l + band * (i + 0.5);

  const root = svg('svg', { class: 'plot', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Chart' });
  root.append(svg('text', { class: 'plot-tick', x: 2, y: 12 }, 'rows'));
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
  if (points.length <= 12) { // few enough points for their counts to fit above them
    points.forEach((p, i) => root.append(svg('text', { class: 'plot-value', x: x(i), y: y(p.n) - 8, 'text-anchor': 'middle' }, p.n.toLocaleString())));
  }

  // one Tab stop for the whole plot; the arrow keys, Home and End move between points
  const hits = points.map((p, i) => {
    const hit = svg('rect', {
      class: 'plot-hit', x: edge.l + band * i, y: edge.t, width: band, height: plotH,
      tabindex: i === 0 ? 0 : -1, role: 'button', 'aria-label': `${describe(p)}. Show only these rows`,
    });
    const on = () => { marks[i].classList.add('is-hot'); onHover(p); };
    const off = () => { marks[i].classList.remove('is-hot'); onHover(null); };
    hit.addEventListener('pointerenter', on);
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('focus', () => { hits.forEach((h, j) => h.setAttribute('tabindex', j === i ? 0 : -1)); on(); });
    hit.addEventListener('blur', off);
    hit.addEventListener('click', () => onPick(p));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(p); return; }
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: points.length - 1 }[e.key];
      if (to !== undefined && hits[to]) { e.preventDefault(); hits[to].focus(); }
    });
    return hit;
  });
  root.append(...hits);
  body.replaceChildren(root);
}

const TAU = Math.PI * 2;

/**
 * A ring of slices with a legend of one row per slice. The legend rows are the keyboard way in (the slices are
 * for the pointer), so each is a button that lights its slice on hover or focus and picks it on click.
 * A point with `other: true` is hovered but not picked: it stands for every value without a slice of its own.
 */
export function drawDonut(body, points, { onPick, onHover }) {
  const size = 180, mid = size / 2, outer = 84, inner = 54;
  const total = points.reduce((n, p) => n + p.n, 0);
  const at = (r, a) => `${mid + r * Math.sin(a)},${mid - r * Math.cos(a)}`; // angle a runs clockwise from 12 o'clock
  const root = svg('svg', { class: 'donut', viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true' });

  let from = 0;
  const slices = points.map((p, i) => {
    const to = from + (p.n / total) * TAU;
    const big = to - from > Math.PI ? 1 : 0;
    const slice = p.n === total
      ? svg('circle', { cx: mid, cy: mid, r: (outer + inner) / 2, 'stroke-width': outer - inner }) // one value: a whole ring
      : svg('path', { d: `M${at(outer, from)} A${outer},${outer} 0 ${big} 1 ${at(outer, to)} L${at(inner, to)} A${inner},${inner} 0 ${big} 0 ${at(inner, from)} Z` });
    slice.setAttribute('class', 'donut-slice');
    slice.style.setProperty('--slice', `var(${seriesVar(p, i)})`);
    from = to;
    return slice;
  });
  root.append(...slices,
    svg('text', { class: 'donut-total', x: mid, y: mid + 2, 'text-anchor': 'middle' }, total.toLocaleString()),
    svg('text', { class: 'donut-unit', x: mid, y: mid + 18, 'text-anchor': 'middle' }, 'rows'));

  const on = (i) => { slices[i].classList.add('is-hot'); root.classList.add('dim'); onHover(points[i]); };
  const off = (i) => { slices[i].classList.remove('is-hot'); root.classList.remove('dim'); onHover(null); };
  const legend = points.map((p, i) => {
    const row = html('button', { type: 'button', className: 'legend-row', title: p.pick ? `${describe(p)}\nShow only these rows` : describe(p) },
      html('span', { className: 'legend-swatch' }),
      html('span', { className: 'bar-label', textContent: p.label }),
      html('span', { className: 'bar-n', textContent: p.n.toLocaleString() }),
      html('span', { className: 'bar-pct', textContent: pct(p.share) }));
    row.firstChild.style.setProperty('--slice', slices[i].style.getPropertyValue('--slice'));
    if (!p.pick) row.setAttribute('aria-disabled', 'true');
    row.addEventListener('pointerenter', () => on(i));
    row.addEventListener('pointerleave', () => off(i));
    row.addEventListener('focus', () => on(i));
    row.addEventListener('blur', () => off(i));
    row.addEventListener('click', () => onPick(p));
    slices[i].addEventListener('pointerenter', () => on(i));
    slices[i].addEventListener('pointerleave', () => off(i));
    slices[i].addEventListener('click', () => onPick(p));
    return html('li', {}, row);
  });
  body.replaceChildren(html('div', { className: 'donut-wrap' }, root, html('ol', { className: 'legend' }, ...legend)));
}
