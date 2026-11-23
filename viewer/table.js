/**
 * table.js
 * A CSV or TSV file as a table. A bar above it filters rows, shows or hides columns (Columns menu), shows
 * flagged or unflagged rows (Flags menu) and charts a column. Headers sort, a checkbox column selects rows to
 * copy or flag with a colour, and rows come in pages.
 *
 * Flags and hidden columns are saved in the browser per folder and file, never in the folder. A flag follows
 * the row's content (a hash of its cells), not its position. Filter, sort, page and selection are kept per
 * file for the session, so a reload after the file changes puts you back where you were.
 */
import { bodyEl, copyContentBtn, state, pref } from './state.js';
import { parseDelimited, tableView, toDelimited, rowKey, columnStats } from './core.js';
import { flash, setupMenu } from './dom.js';

const URL_CELL = /^https?:\/\/\S+$/i;
const FLAGS = ['red', 'orange', 'green', 'blue', 'purple']; // colours a table row can be flagged with
const cap = (word) => word[0].toUpperCase() + word.slice(1);
const tableStates = new Map(); // file path → its table's filter, sort, page and selection

/** Table rows per page (Settings → Rows per page); "all" is a page too big to fill. */
const rowsPerPage = () => {
  const v = pref.get('rows') ?? '500';
  return v === 'all' ? Number.MAX_SAFE_INTEGER : Number(v) || 500; // not Infinity: page × Infinity is NaN
};

const make = (tag, props, ...kids) => { const el = Object.assign(document.createElement(tag), props); el.append(...kids); return el; };

/** Focus the table's filter box ("/"); false when the open file has none. */
export function focusTableFilter() {
  const box = bodyEl.querySelector('.table-bar input');
  box?.focus();
  box?.select();
  return Boolean(box);
}

/** A saved JSON preference for this file, or `fallback` when it is missing or damaged. */
function readSaved(name, fallback) {
  try { return JSON.parse(pref.get(name) || 'null') ?? fallback; } catch { return fallback; }
}

/** Draws the table in the reader and returns a function giving the text Copy should take: the matching rows. */
export function renderTable(text, delim, key) {
  const [head = [], ...rows] = parseDelimited(text, delim);
  const label = (i) => head[i] || `Column ${i + 1}`;
  const cellEl = (cell) => {
    const td = make('td', cell.length > 60 ? { title: cell } : {}); // a long cell may be cut short, so its full text is the tooltip
    if (URL_CELL.test(cell)) td.append(make('a', { href: cell, textContent: cell, target: '_blank', rel: 'noopener noreferrer' }));
    else td.textContent = cell;
    return td;
  };

  const where = `${state.currentFolder?.id ?? ''}:${key}`;
  const keys = rows.map(rowKey);
  const flags = readSaved(`flags:${where}`, {}); // row key → colour
  const saveFlags = () => (Object.keys(flags).length ? pref.set(`flags:${where}`, JSON.stringify(flags)) : pref.remove(`flags:${where}`));
  const saveHidden = () => {
    const names = [...s.hidden].map((i) => head[i]);
    if (names.length) pref.set(`cols:${where}`, JSON.stringify(names)); else pref.remove(`cols:${where}`);
  };

  const saved = tableStates.get(key);
  const s = saved && saved.sortCol < head.length ? saved
    : { query: '', sortCol: -1, desc: false, page: 0, flag: 'all', eq: null, chart: { open: false, col: 0 }, selected: new Set() };
  const size = rowsPerPage();
  if (s.size !== size) s.page = 0; // a new page size starts from the first page
  s.size = size;
  s.hidden = new Set(readSaved(`cols:${where}`, []).map((name) => head.indexOf(name)).filter((i) => i >= 0));
  if (s.hidden.has(s.sortCol)) { s.sortCol = -1; s.desc = false; }
  tableStates.set(key, s);

  const visible = () => head.map((_, i) => i).filter((i) => !s.hidden.has(i));
  /** The rows `ids` as copyable cells: the header and the visible columns only. */
  const project = (ids) => {
    const cols = visible();
    return [cols.map((c) => head[c]), ...ids.map((i) => cols.map((c) => rows[i][c] ?? ''))];
  };

  // Cells are built on demand, one page at a time: the DOM stays small however long the file is.
  const trs = new Array(rows.length);
  const trAt = (i) => {
    if (trs[i]) return trs[i];
    const pick = make('td', { className: 'sel-cell' },
      make('input', { type: 'checkbox', className: 'row-pick', ariaLabel: `Select row ${i + 1}` }),
      make('span', { className: 'flag-mark', textContent: '⚑', role: 'img' }));
    const tr = make('tr', {}, pick, ...rows[i].map(cellEl));
    tr.dataset.i = i;
    return (trs[i] = tr);
  };
  const paint = (i) => {
    const tr = trs[i], color = flags[keys[i]], on = s.selected.has(keys[i]);
    if (color) tr.dataset.flag = color; else delete tr.dataset.flag;
    tr.classList.toggle('picked', on);
    const [box, mark] = tr.firstChild.children;
    box.checked = on;
    mark.classList.toggle('on', Boolean(color));
    mark.ariaLabel = color ? `Flagged ${color}` : null;
    for (let c = 0; c < head.length; c++) tr.children[c + 1].hidden = s.hidden.has(c); // the tick cell comes first
  };

  // ── The table ──
  const ths = head.map((_, i) => make('th', {}, make('button', { type: 'button', className: 'sort-head' },
    make('span', { className: 'sort-label', textContent: label(i) }), make('span', { className: 'sort-icon', ariaHidden: 'true' }))));
  const pickAll = make('input', { type: 'checkbox', ariaLabel: 'Select every matching row', title: 'Select every matching row' });
  const tbody = make('tbody');
  const table = make('table', {});
  table.createTHead().append(make('tr', {}, make('th', { className: 'sel-cell' }, pickAll), ...ths));
  table.append(tbody);
  const wrap = make('div', { className: 'table-wrap' }, table);

  // ── The bar: filter, Columns, Flags, Chart · count, selection tools, pager ──
  const menuButton = (text, title) => make('button', { type: 'button', className: 'btn menu-btn', textContent: text, title, ariaHasPopup: 'menu', ariaExpanded: 'false' });
  const popup = (button, fill) => {
    const menu = make('div', { className: 'menu table-menu', popover: 'auto', role: 'menu' });
    button.popoverTargetElement = menu;
    setupMenu(menu, button, fill, button);
    return menu;
  };
  const choice = (role, name, ...extra) => make('button', { type: 'button', role }, make('span', { className: 'm-check', ariaHidden: 'true' }), make('span', { className: 'm-name', textContent: name }), ...extra);

  const query = make('input', {
    type: 'search', placeholder: 'Filter rows, or column:text ( / )', autocomplete: 'off', ariaLabel: 'Filter rows', value: s.query,
    title: 'Every word must match. A plain word looks in the visible columns; column:text looks in that column only; "quotes" keep a phrase together; -word leaves matches out.',
  });

  const colBtn = menuButton('Columns', 'Show or hide columns');
  const colItems = head.map((_, i) => { const b = choice('menuitemcheckbox', label(i)); b.dataset.col = i; return b; });
  const showAllItem = make('button', { type: 'button', role: 'menuitem', textContent: 'Show all columns' });
  const wrapItem = choice('menuitemcheckbox', 'Wrap long cells');
  const colMenu = popup(colBtn, () => syncColumns());
  colMenu.append(...colItems, make('hr'), showAllItem, wrapItem);

  const flagBtn = menuButton('Flags', 'Show flagged or unflagged rows');
  const flagChoices = ['all', 'flagged', 'unflagged', ...FLAGS];
  const flagLabel = (v) => (v === 'all' ? 'All rows' : cap(v));
  const flagItems = flagChoices.map((v) => {
    const dot = make('span', { className: 'flag-dot', ariaHidden: 'true' });
    dot.dataset.color = FLAGS.includes(v) ? v : '';
    const b = make('button', { type: 'button', role: 'menuitemradio' }, make('span', { className: 'm-check', ariaHidden: 'true' }), dot,
      make('span', { className: 'm-name', textContent: flagLabel(v) }), make('span', { className: 'm-count' }));
    b.dataset.flag = v;
    return b;
  });
  const flagMenu = popup(flagBtn, () => syncFlags());
  flagMenu.append(...flagItems);

  const chartBtn = make('button', { type: 'button', className: 'btn', textContent: 'Chart', title: 'Chart a column of the matching rows', disabled: head.length === 0 });
  const eqChip = make('button', { type: 'button', className: 'btn eq-chip', title: 'Show all rows again' });
  const count = make('span', { className: 'table-count' });

  const picked = make('span', { className: 'bulk-count' });
  const copyPick = make('button', { type: 'button', className: 'btn', textContent: 'Copy', title: 'Copy the selected rows' });
  const swatches = make('span', { className: 'flag-swatches', role: 'group', ariaLabel: 'Flag the selected rows' },
    ...FLAGS.map((c) => { const b = make('button', { type: 'button', className: 'flag-swatch', ariaLabel: `Flag ${c}`, title: `Flag ${c}` }); b.dataset.color = c; return b; }),
    make('button', { type: 'button', className: 'flag-swatch none', textContent: '×', ariaLabel: 'Remove flag', title: 'Remove flag' }));
  const clearPick = make('button', { type: 'button', className: 'btn', textContent: 'Clear', title: 'Clear the selection' });
  const bulk = make('span', { className: 'table-bulk', hidden: true }, picked, copyPick, swatches, clearPick);
  const prevBtn = make('button', { type: 'button', className: 'btn', textContent: '‹', ariaLabel: 'Previous page', title: 'Previous page' });
  const nextBtn = make('button', { type: 'button', className: 'btn', textContent: '›', ariaLabel: 'Next page', title: 'Next page' });
  const pager = make('span', { className: 'table-pager' }, prevBtn, nextBtn);
  const bar = make('div', { className: 'table-bar' }, query, colBtn, flagBtn, eqChip, chartBtn, count, bulk, pager);

  // ── The chart panel ──
  const chartCol = make('select', { ariaLabel: 'Chart column', title: 'Chart column' }, ...head.map((_, i) => new Option(label(i), i)));
  const chartNote = make('span', { className: 'chart-note' });
  const chartBars = make('ol', { className: 'chart-bars' });
  const chart = make('section', { className: 'table-chart', ariaLabel: 'Chart', hidden: true },
    make('div', { className: 'chart-head' }, chartCol, chartNote), chartBars);

  const view = make('div', { className: 'table-view' }, bar, chart, wrap, colMenu, flagMenu);

  // ── What is shown ──
  const flagTest = () => (s.flag === 'all' ? null : (i) => {
    const color = flags[keys[i]];
    return s.flag === 'flagged' ? Boolean(color) : s.flag === 'unflagged' ? !color : color === s.flag;
  });
  // `eq` is a chart bar's value: only rows whose cell in that column is exactly it
  const matching = () => {
    const byFlag = flagTest();
    const eq = s.eq;
    const keepRow = byFlag && eq ? (i) => byFlag(i) && rows[i][eq.col] === eq.value
      : eq ? (i) => rows[i][eq.col] === eq.value : byFlag;
    return tableView(rows, { ...s, head, cols: s.hidden.size ? visible() : null, keep: keepRow });
  };
  let shown = [];   // every matching row, in display order
  let onPage = [];  // the rows on the current page
  let last = -1;    // position in `shown` of the last row ticked, for shift-click ranges
  let flagCounts = {};

  const syncColumns = () => {
    const open = visible().length;
    colItems.forEach((b, i) => {
      const on = !s.hidden.has(i);
      b.setAttribute('aria-checked', String(on));
      b.disabled = on && open === 1; // one column always stays
    });
    showAllItem.disabled = s.hidden.size === 0;
    wrapItem.setAttribute('aria-checked', String(pref.on('table-wrap', false)));
  };
  const syncFlags = () => {
    flagItems.forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.flag === s.flag));
      b.lastChild.textContent = (flagCounts[b.dataset.flag] ?? 0).toLocaleString();
    });
  };
  const applyHidden = () => ths.forEach((th, i) => { th.hidden = s.hidden.has(i); }); // body cells follow in `paint`

  const renderChart = () => {
    chart.hidden = !s.chart.open;
    chartBtn.setAttribute('aria-pressed', String(s.chart.open));
    if (!s.chart.open) return;
    const col = s.chart.col;
    const st = columnStats(rows, shown, col);
    const num = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const rowsNote = `${st.total.toLocaleString()} row${st.total === 1 ? '' : 's'}${st.empty ? ` · ${st.empty.toLocaleString()} empty` : ''}`;
    chartCol.value = String(col);
    const line = (labelText, n, widest, item) => {
      const fill = make('span', { className: 'bar-fill' });
      fill.style.width = `${widest ? (n / widest) * 100 : 0}%`;
      return make('li', {}, make(item.tag, item.props, make('span', { className: 'bar-label', textContent: labelText, title: labelText }),
        make('span', { className: 'bar-track' }, fill), make('span', { className: 'bar-n', textContent: n.toLocaleString() })));
    };
    if (st.kind === 'numbers') {
      chartNote.textContent = `${num(st.bins[0].from)} to ${num(st.bins.at(-1).to)} · ${rowsNote}`;
      const widest = Math.max(...st.bins.map((b) => b.count));
      chartBars.replaceChildren(...st.bins.map((b) => line(`${num(b.from)} – ${num(b.to)}`, b.count, widest, { tag: 'div', props: { className: 'bar-row' } })));
    } else {
      chartNote.textContent = `${st.distinct.toLocaleString()} distinct · ${rowsNote}`;
      const widest = st.top[0]?.count ?? 0;
      const items = st.top.map((t) => {
        const li = line(t.value, t.count, widest, { tag: 'button', props: { type: 'button', className: 'bar-row', title: `Show only rows where ${label(col)} is “${t.value}”` } });
        li.firstChild.dataset.value = t.value;
        return li;
      });
      if (st.other) items.push(make('li', { className: 'bar-other', textContent: `${st.other.toLocaleString()} more rows in ${(st.distinct - st.top.length).toLocaleString()} other values` }));
      chartBars.replaceChildren(...items);
    }
  };

  /** Selection and flag counts, the selection bar and the select-all box: no table rebuild, so focus stays. */
  const refresh = () => {
    let flagged = 0, picks = 0;
    flagCounts = {};
    keys.forEach((k) => {
      const color = flags[k];
      if (color) { flagCounts[color] = (flagCounts[color] || 0) + 1; flagged++; }
      if (s.selected.has(k)) picks++;
    });
    Object.assign(flagCounts, { all: rows.length, flagged, unflagged: rows.length - flagged });
    picked.textContent = `${picks.toLocaleString()} selected`;
    bulk.hidden = picks === 0;
    count.hidden = picks > 0;
    const ticked = shown.filter((i) => s.selected.has(keys[i])).length;
    pickAll.checked = ticked > 0 && ticked === shown.length;
    pickAll.indeterminate = ticked > 0 && ticked < shown.length;
  };
  const update = () => {
    shown = matching();
    last = -1;
    const pages = Math.max(1, Math.ceil(shown.length / size));
    s.page = Math.min(s.page, pages - 1);
    const from = s.page * size;
    const to = Math.min(shown.length, from + size);
    onPage = shown.slice(from, to);
    const frag = document.createDocumentFragment();
    for (const i of onPage) { frag.append(trAt(i)); paint(i); }
    tbody.replaceChildren(frag);
    const filtered = shown.length !== rows.length;
    count.textContent = (pages > 1 ? `${(from + 1).toLocaleString()}–${to.toLocaleString()} of ` : '')
      + (filtered ? `${shown.length.toLocaleString()} matching · ${rows.length.toLocaleString()} rows`
        : `${rows.length.toLocaleString()} row${rows.length === 1 ? '' : 's'}`);
    pager.hidden = pages === 1;
    prevBtn.disabled = s.page === 0;
    nextBtn.disabled = s.page === pages - 1;
    ths.forEach((th, i) => {
      const on = i === s.sortCol;
      th.setAttribute('aria-sort', !on ? 'none' : s.desc ? 'descending' : 'ascending');
      th.firstChild.title = !on ? 'Sort ascending' : !s.desc ? 'Sort descending' : 'Back to file order';
    });
    refresh();
    colBtn.textContent = s.hidden.size ? `Columns · ${s.hidden.size} hidden` : 'Columns';
    colBtn.classList.toggle('active', s.hidden.size > 0);
    flagBtn.textContent = s.flag === 'all' ? 'Flags' : `Flags: ${flagLabel(s.flag)}`;
    flagBtn.classList.toggle('active', s.flag !== 'all');
    eqChip.hidden = !s.eq;
    if (s.eq) eqChip.textContent = `${label(s.eq.col)} = ${s.eq.value} ×`;
    renderChart();
  };
  const setWrap = (on) => {
    pref.setOn('table-wrap', on);
    wrap.classList.toggle('compact', !on);
    syncColumns();
  };
  const change = (patch) => { Object.assign(s, patch, { page: 0 }); update(); }; // a new filter or sort starts from the first page
  const turn = (by) => { s.page += by; update(); wrap.scrollTop = 0; };
  const tick = (positions, on) => {
    for (const p of positions) s.selected[on ? 'add' : 'delete'](keys[shown[p]]);
    onPage.forEach(paint); // no rebuild: the checkbox keeps focus
    refresh();
  };
  const toggleColumn = (i) => {
    if (s.hidden.has(i)) s.hidden.delete(i); else s.hidden.add(i);
    if (s.hidden.has(s.sortCol)) { s.sortCol = -1; s.desc = false; }
    saveHidden();
    applyHidden();
    syncColumns();
    change({}); // the filter now looks only at the visible columns
  };

  // ── Events ──
  let timer;
  query.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => change({ query: query.value }), 120); });
  query.addEventListener('keydown', (e) => { if (e.key === 'Escape' && query.value) { query.value = ''; change({ query: '' }); } });
  colMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[role^="menuitem"]');
    if (!item || item.disabled) return;
    if (item.dataset.col !== undefined) toggleColumn(Number(item.dataset.col));
    else if (item === wrapItem) setWrap(!pref.on('table-wrap', false));
    else { s.hidden.clear(); saveHidden(); applyHidden(); syncColumns(); change({}); }
  });
  flagMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-flag]');
    if (!item) return;
    flagMenu.hidePopover();
    change({ flag: item.dataset.flag });
  });
  chartBtn.addEventListener('click', () => { s.chart.open = !s.chart.open; update(); });
  chartCol.addEventListener('change', () => { s.chart.col = Number(chartCol.value); renderChart(); });
  chartBars.addEventListener('click', (e) => {
    const hit = e.target.closest('button.bar-row');
    if (hit) change({ eq: { col: s.chart.col, value: hit.dataset.value } });
  });
  eqChip.addEventListener('click', () => change({ eq: null }));
  prevBtn.addEventListener('click', () => turn(-1));
  nextBtn.addEventListener('click', () => turn(1));
  // a header click: ascending, then descending, then back to file order
  ths.forEach((th, i) => th.addEventListener('click', () => {
    if (s.sortCol !== i) change({ sortCol: i, desc: false });
    else if (!s.desc) change({ desc: true });
    else change({ sortCol: -1, desc: false });
  }));

  tbody.addEventListener('click', (e) => {
    const box = e.target.closest('.row-pick');
    if (!box) return;
    const pos = shown.indexOf(Number(box.closest('tr').dataset.i));
    const [lo, hi] = e.shiftKey && last >= 0 ? [Math.min(last, pos), Math.max(last, pos)] : [pos, pos];
    last = pos;
    tick(Array.from({ length: hi - lo + 1 }, (_, n) => lo + n), box.checked);
  });
  pickAll.addEventListener('change', () => tick(shown.keys(), pickAll.checked));
  clearPick.addEventListener('click', () => { s.selected.clear(); onPage.forEach(paint); refresh(); });
  swatches.addEventListener('click', (e) => {
    const swatch = e.target.closest('.flag-swatch');
    if (!swatch) return;
    for (const k of s.selected) { if (swatch.dataset.color) flags[k] = swatch.dataset.color; else delete flags[k]; }
    saveFlags();
    update(); // a flag filter may now show different rows
  });
  copyPick.addEventListener('click', async () => {
    const chosen = tableView(rows, { sortCol: s.sortCol, desc: s.desc, keep: (i) => s.selected.has(keys[i]) });
    try {
      await navigator.clipboard.writeText(toDelimited(project(chosen), delim));
      flash(copyPick);
    } catch (err) {
      console.warn('[Doctree] copy failed:', err);
    }
  });

  applyHidden();
  syncColumns();
  syncFlags();
  update();
  wrap.classList.toggle('compact', !pref.on('table-wrap', false));
  copyContentBtn.title = 'Copy the matching rows (visible columns), every page';
  bodyEl.replaceChildren(view);
  return () => toDelimited(project(matching()), delim);
}
