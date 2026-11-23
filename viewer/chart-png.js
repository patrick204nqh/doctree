/**
 * chart-png.js
 * Draws a chart onto a canvas, to share as a PNG. It repeats what chart.js shows, in the colours of the current
 * theme, at a fixed 1200 px width and twice the resolution, under a title that names the file, the column and
 * the filter, so the picture still makes sense once it is pasted away from the table.
 *
 * `shape` is "bars" (a list of horizontal bars), "columns", "line" or "donut"; `points` are as in chart.js.
 */
import { niceTicks } from './core.js';
import { pct, seriesVar } from './chart.js';

const W = 1200;
const PAD = 40;
const SCALE = 2;
const HEAD = 96;
const FOOT = 48;
const TAU = Math.PI * 2;

export function chartToCanvas({ shape, points, title, subtitle, note = '' }) {
  const theme = getComputedStyle(document.documentElement);
  const color = (name) => theme.getPropertyValue(name).trim();
  const family = getComputedStyle(document.body).fontFamily;

  const bodyH = shape === 'bars' ? points.length * 36 + 8 : shape === 'donut' ? Math.max(300, points.length * 34 + 24) : 340;
  const H = HEAD + bodyH + FOOT;
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  /** Text at (x, y) on its baseline, cut with an ellipsis past `max` px. */
  const text = (str, x, y, { size = 15, weight = 400, fill = '--fg', align = 'left', max = Infinity } = {}) => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color(fill);
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    let out = str;
    if (ctx.measureText(out).width > max) {
      let n = out.length;
      while (n > 1 && ctx.measureText(`${out.slice(0, n)}…`).width > max) n--;
      out = `${out.slice(0, n)}…`;
    }
    ctx.fillText(out, x, y);
  };
  const fillRound = (x, y, w, h, radii, fill, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color(fill);
    ctx.beginPath();
    ctx.roundRect(x, y, Math.max(w, 0), Math.max(h, 0), radii);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  ctx.fillStyle = color('--bg');
  ctx.fillRect(0, 0, W, H);
  text(title, PAD, 46, { size: 26, weight: 600, max: W - 2 * PAD });
  text(subtitle, PAD, 74, { size: 15, fill: '--muted', max: W - 2 * PAD });
  text('Doctree', W - PAD, H - 18, { size: 13, fill: '--muted', align: 'right' });
  if (note) text(note, PAD, H - 18, { size: 13, fill: '--muted', max: W - 2 * PAD - 120 });
  const top = HEAD;

  if (shape === 'bars') {
    const labelW = 300;
    const x0 = PAD + labelW + 16;
    const x1 = W - PAD - 150;
    const widest = Math.max(1, ...points.map((p) => p.n));
    points.forEach((p, i) => {
      const y = top + i * 36;
      text(p.label, PAD, y + 22, { max: labelW });
      fillRound(x0, y + 9, x1 - x0, 12, 4, '--fg', 0.1);
      fillRound(x0, y + 9, ((x1 - x0) * p.n) / widest, 12, 4, '--link', 0.8);
      text(p.n.toLocaleString(), W - PAD - 62, y + 22, { align: 'right', fill: '--muted' });
      text(pct(p.share), W - PAD, y + 22, { align: 'right', fill: '--muted' });
    });
  } else if (shape === 'donut') {
    const cx = PAD + 170;
    const cy = top + bodyH / 2;
    const outer = 140;
    const inner = 90;
    const total = points.reduce((n, p) => n + p.n, 0);
    let from = -Math.PI / 2; // start at 12 o'clock
    points.forEach((p, i) => {
      const to = from + (p.n / total) * TAU;
      ctx.beginPath();
      if (p.n === total) { ctx.arc(cx, cy, outer, 0, TAU); ctx.arc(cx, cy, inner, 0, TAU, true); } else { ctx.arc(cx, cy, outer, from, to); ctx.arc(cx, cy, inner, to, from, true); }
      ctx.closePath();
      ctx.fillStyle = color(seriesVar(p, i));
      ctx.fill();
      ctx.strokeStyle = color('--bg');
      ctx.lineWidth = 2;
      ctx.stroke();
      from = to;
    });
    text(total.toLocaleString(), cx, cy + 12, { size: 40, weight: 600, align: 'center' });
    text('rows', cx, cy + 38, { size: 15, fill: '--muted', align: 'center' });
    const lx = cx + outer + 80;
    const first = top + (bodyH - points.length * 34) / 2;
    points.forEach((p, i) => {
      const y = first + i * 34;
      fillRound(lx, y + 6, 16, 16, 4, seriesVar(p, i));
      text(p.label, lx + 28, y + 20, { max: W - PAD - lx - 28 - 150 });
      text(p.n.toLocaleString(), W - PAD - 62, y + 20, { align: 'right', fill: '--muted' });
      text(pct(p.share), W - PAD, y + 20, { align: 'right', fill: '--muted' });
    });
  } else {
    const left = PAD + 52;
    const right = W - PAD;
    const plotTop = top + 28;
    const plotBottom = top + bodyH - 44;
    const ticks = niceTicks(Math.max(...points.map((p) => p.n)));
    const ceiling = ticks.at(-1);
    const y = (n) => plotBottom - (n / ceiling) * (plotBottom - plotTop);
    const band = (right - left) / points.length;
    const x = (i) => left + band * (i + 0.5);

    ctx.lineWidth = 1;
    ctx.strokeStyle = color('--border');
    for (const t of ticks) {
      ctx.beginPath();
      ctx.moveTo(left, y(t));
      ctx.lineTo(right, y(t));
      ctx.stroke();
      text(t.toLocaleString(), left - 10, y(t) + 5, { size: 13, fill: '--muted', align: 'right' });
    }
    text('rows', PAD, top + 12, { size: 13, fill: '--muted' });
    const every = Math.ceil(points.length / Math.max(1, Math.floor((right - left) / 110)));
    points.forEach((p, i) => { if (i % every === 0) text(p.label, x(i), plotBottom + 26, { size: 13, fill: '--muted', align: 'center', max: band * every - 8 }); });

    if (shape === 'line') {
      const trace = () => points.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.n)) : ctx.moveTo(x(i), y(p.n))));
      ctx.beginPath();
      trace();
      ctx.lineTo(x(points.length - 1), plotBottom);
      ctx.lineTo(x(0), plotBottom);
      ctx.closePath();
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = color('--link');
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      trace();
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color('--link');
      ctx.stroke();
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(x(i), y(p.n), 5, 0, TAU);
        ctx.fillStyle = color('--bg');
        ctx.fill();
        ctx.stroke();
      });
    } else {
      const w = Math.min(80, band * 0.7);
      points.forEach((p, i) => fillRound(x(i) - w / 2, y(p.n), w, plotBottom - y(p.n), [4, 4, 0, 0], '--link', 0.8));
    }
    if (points.length <= 14) points.forEach((p, i) => text(p.n.toLocaleString(), x(i), y(p.n) - 12, { size: 13, align: 'center' }));
  }
  return canvas;
}
