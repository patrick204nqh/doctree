/**
 * viewer.js
 * Supports two modes:
 *   1. Single-file mode — launched from content_script via ?url=<file://>
 *   2. Folder mode     — user picks a directory; tree shown in sidebar
 */
(function () {
  /* ── DOM refs ─────────────────────────────────────────────────────────── */
  const bodyEl        = document.getElementById('markdown-body');
  const fileNameEl    = document.getElementById('file-name');
  const sidebar       = document.getElementById('sidebar');
  const treeEl        = document.getElementById('tree');
  const resizeHandle  = document.getElementById('resize-handle');
  const openFolderBtn = document.getElementById('open-folder-btn');
  const foldersBtn    = document.getElementById('folders-btn');
  const foldersMenu   = document.getElementById('folders-menu');
  const copyGroup     = document.getElementById('copy-group');
  const copyMenuBtn   = document.getElementById('copy-menu-btn');
  const copyMenu      = document.getElementById('copy-menu');
  const filterEl      = document.getElementById('filter');
  const copyPathBtn   = document.getElementById('copy-path-btn');
  const themeBtn      = document.getElementById('theme-btn');
  const treeToggleBtn = document.getElementById('tree-toggle');
  const quickBtn      = document.getElementById('quick-btn');
  const mainEl        = document.getElementById('main');
  const paletteEl     = document.getElementById('palette');
  const paletteInput  = document.getElementById('palette-input');
  const paletteList   = document.getElementById('palette-list');
  const contentWrapper = document.getElementById('content-wrapper');
  const tocEl         = document.getElementById('toc');
  const tocBtn        = document.getElementById('toc-btn');
  const widthBtn      = document.getElementById('width-btn');

  /* ── State ────────────────────────────────────────────────────────────── */
  let rootHandle      = null;   // FileSystemDirectoryHandle (folder mode)
  let currentPath     = [];     // path array of the currently displayed file
  let blobUrls        = [];     // object URLs to revoke on next file load
  let currentHandle   = null;   // FileSystemFileHandle of the displayed file
  let currentStamp    = '';     // lastModified:size when it was read
  let allFiles        = [];     // every shown file, flat, for quick open
  let treeSig         = '';     // paths of the shown files, to tell whether a rescan found a change
  let scanning        = false;
  let lastScanEnd     = 0;
  let currentFolder   = null;   // saved record of the opened folder: { id, name, handle, base, used }
  let folders         = [];     // saved folders, most recently used first
  let tocHeads        = [];     // h1–h3 of the open file, in order
  let tocOn           = localStorage.getItem('doctree-toc') === 'on';

  const { LINK, splitFrontmatter, resolvePathArray, resolveUrl, escapeAttr, findIndex, buildTree, flatten, searchFiles, headingIds } = DoctreeCore;
  const TEXT_CAP = 256 * 1024;                  // bytes shown before "Show all"
  const RECENT_MAX  = 8;
  const RESCAN_MS   = 15000;
  const FOLDERS_MAX = 8;
  const MAC         = /mac/i.test(navigator.platform);
  const ICON_FOLDER = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5a1 1 0 0 1 1-1h3.2l1.3 1.5h6.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const ICON_FILE   = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3 3V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2.5a1 1 0 0 1 1-1zM9 1.5v3h3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  const ICON_COLLAPSE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5l4 3.5 4-3.5M4 13.5L8 10l4 3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_REVEAL   = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v3M8 11.5v3M1.5 8h3M11.5 8h3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  const ICON_REFRESH  = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 8A5.5 5.5 0 1 1 11.9 4.1M13.5 2v3.2h-3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* ── Initialise ───────────────────────────────────────────────────────── */
  const params  = new URLSearchParams(window.location.search);
  const fileUrl = params.get('url');

  if (fileUrl) {
    const name = decodeURIComponent(fileUrl.split('/').pop());
    setTitle(name);
    loadFromStorage(fileUrl);
    refreshFolders();
  } else {
    bodyEl.innerHTML =
      '<p style="color:var(--muted);padding:2em">Click Open Folder to pick a folder, or open a .md file in Chrome.</p>';
    restoreRoot();
  }

  /* ── Sidebar resize ───────────────────────────────────────────────────── */
  let isResizing = false;
  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const mainRect = document.getElementById('main').getBoundingClientRect();
    const newWidth = Math.max(160, Math.min(480, e.clientX - mainRect.left));
    sidebar.style.width = newWidth + 'px';
  });
  document.addEventListener('mouseup', () => {
    isResizing = false;
    document.body.style.cursor = '';
  });

  /* ── Filter the tree by path ─────────────────────────────────────────── */
  filterEl.addEventListener('input', () => {
    const term = filterEl.value.trim().toLowerCase();
    treeEl.querySelectorAll('li').forEach((li) => { li.hidden = false; });
    if (!term) return;
    treeEl.querySelectorAll('.tree-file').forEach((btn) => {
      btn.closest('li').hidden = !btn.dataset.search.includes(term);
    });
    // Innermost folders first: a folder stays only if one of its children stays
    [...treeEl.querySelectorAll('details')].reverse().forEach((d) => {
      const keep = d.querySelector(':scope > ul > li:not([hidden])') !== null;
      d.closest('li').hidden = !keep;
      d.open = keep;
    });
  });

  function clearFilter() {
    filterEl.value = '';
    filterEl.dispatchEvent(new Event('input'));
  }

  /* ── Menus: top layer, so the toolbar's overflow never clips them ────── */
  setupMenu(foldersMenu, foldersBtn, fillFoldersMenu);
  setupMenu(copyMenu, copyMenuBtn, fillCopyMenu);

  function setupMenu(menu, button, fill) {
    menu.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') fill();
    });
    menu.addEventListener('toggle', (e) => {
      button.setAttribute('aria-expanded', String(e.newState === 'open'));
      if (e.newState !== 'open') return;
      placeMenu(menu, button.parentElement);
      (menu.querySelector('[autofocus]') ?? menu.querySelector('button:not([disabled])'))?.focus();
    });
    menu.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...menu.querySelectorAll('button:not([disabled])')];
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
  }

  function placeMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    menu.style.top = rect.bottom + 4 + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8)) + 'px';
  }

  function menuItem(label, value, data) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    Object.assign(btn.dataset, data);
    btn.append(textSpan('m-label', label));
    if (value) btn.append(textSpan('m-value', value));
    return btn;
  }

  /* ── Copy path: absolute by default, relative from the menu ──────────── */
  copyPathBtn.addEventListener('click', () => copyPath('absolute'));
  copyMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-copy]');
    if (!item) return;
    copyMenu.hidePopover();
    copyPath(item.dataset.copy);
  });

  function relPath() {
    return currentPath.slice(1).join('/');
  }

  function absPath() {
    return currentFolder?.base ? currentFolder.base + '/' + relPath() : '';
  }

  async function copyPath(kind) {
    const text = kind === 'absolute' ? absPath() : relPath();
    if (!text) { // the folder's location on disk is not known yet
      copyMenu.showPopover();
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('[Doctree] copy failed:', err);
      return;
    }
    copyPathBtn.textContent = 'Copied';
    setTimeout(() => { copyPathBtn.textContent = 'Copy path'; }, 1200);
  }

  function fillCopyMenu() {
    const abs = menuItem('Absolute path', absPath() || 'Set the folder location below first', { copy: 'absolute' });
    abs.disabled = !absPath();

    const input = document.createElement('input');
    input.id = 'base-input';
    input.type = 'text';
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.placeholder = '/Users/you/' + rootHandle.name;
    input.value = currentFolder.base;
    input.autofocus = !currentFolder.base;
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save';
    const row = document.createElement('div');
    row.className = 'm-row';
    row.append(input, save);
    const label = document.createElement('label');
    label.htmlFor = 'base-input';
    label.textContent = 'Folder location on disk';
    const error = textSpan('m-error', '');
    const form = document.createElement('form');
    form.className = 'm-form';
    form.append(label, textSpan('m-note', 'Chrome cannot tell where the opened folder lives, so enter it once.'), row, error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const base = input.value.trim().replace(/[\\/]+$/, '');
      if (!/^(\/|[A-Za-z]:[\\/])/.test(base)) {
        error.textContent = 'Enter a full path, like /Users/you/' + rootHandle.name;
        return;
      }
      currentFolder.base = base;
      await putFolder(currentFolder);
      await refreshFolders();
      copyMenu.hidePopover();
      copyPath('absolute');
    });

    copyMenu.replaceChildren(abs, menuItem('Relative path', relPath(), { copy: 'relative' }), document.createElement('hr'), form);
  }

  /* ── Reload the open file when it changes on disk ────────────────────── */
  function stampOf(file) {
    return file.lastModified + ':' + file.size;
  }

  async function reloadCurrent() {
    const top = contentWrapper.scrollTop;
    await loadFileHandle(currentHandle, currentPath);
    contentWrapper.scrollTop = top;
  }

  setInterval(async () => {
    if (document.hidden || !currentHandle) return;
    try {
      if (stampOf(await currentHandle.getFile()) === currentStamp) return;
      await reloadCurrent();
    } catch {
      // File removed or mid-write: keep what is on screen
    }
  }, 2000);

  /* ── Light / dark theme (theme.js sets the first value before paint) ─── */
  showTheme();
  themeBtn.addEventListener('click', () => {
    document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
    localStorage.setItem('doctree-theme', document.documentElement.dataset.theme);
    showTheme();
    if (currentHandle) reloadCurrent(); // redraws Mermaid in the new theme
  });

  function showTheme() {
    themeBtn.textContent = isDark() ? 'Light' : 'Dark';
    themeBtn.title = 'Switch to the ' + (isDark() ? 'light' : 'dark') + ' theme';
  }

  /* ── Reading width: full by default, or a contained column ───────────── */
  showWidth();
  widthBtn.addEventListener('click', toggleWidth);

  function toggleWidth() {
    const next = document.documentElement.dataset.width === 'full' ? 'contained' : 'full';
    document.documentElement.dataset.width = next;
    localStorage.setItem('doctree-width', next);
    showWidth();
  }

  function showWidth() {
    const full = document.documentElement.dataset.width === 'full';
    widthBtn.textContent = full ? 'Contain' : 'Full width';
    widthBtn.title = 'Switch to ' + (full ? 'a contained column' : 'full width') + ' (w)';
  }

  /* ── Tree visibility: toggle button and backslash key ────────────────── */
  quickBtn.querySelector('kbd').textContent = MAC ? '⌘K' : 'Ctrl K';
  setTreeShown(localStorage.getItem('doctree-tree') !== 'off');
  treeToggleBtn.addEventListener('click', () => setTreeShown(mainEl.dataset.tree === 'off', true));

  function setTreeShown(shown, save) {
    mainEl.dataset.tree = shown ? 'on' : 'off';
    treeToggleBtn.setAttribute('aria-expanded', String(shown));
    if (save) localStorage.setItem('doctree-tree', shown ? 'on' : 'off');
  }

  function typing() {
    return /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  }

  document.addEventListener('keydown', (e) => {
    if (!rootHandle) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openPalette();
    } else if (e.key === '\\' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing()) {
      setTreeShown(mainEl.dataset.tree === 'off', true);
    }
  });

  /* ── Outline: h1–h3 of the open file, hidden until asked for ─────────── */
  tocBtn.addEventListener('click', () => setToc(!tocOn));
  tocEl.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-i]');
    if (!a) return;
    e.preventDefault();
    tocHeads[a.dataset.i].scrollIntoView();
  });
  contentWrapper.addEventListener('scroll', () => requestAnimationFrame(markToc), { passive: true });
  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || typing()) return;
    if (e.key === 'o' && tocHeads.length) setToc(!tocOn);
    else if (e.key === 'w') toggleWidth();
  });

  function setToc(on) {
    tocOn = on;
    localStorage.setItem('doctree-toc', on ? 'on' : 'off');
    showToc();
  }

  function buildToc() {
    const heads = [...bodyEl.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const ids = headingIds(heads.map((h) => h.textContent));
    heads.forEach((h, i) => { h.id = ids[i]; }); // targets for in-page #links
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
    tocBtn.hidden = !tocHeads.length;
    tocBtn.setAttribute('aria-expanded', String(tocOn));
    tocEl.hidden = !(tocOn && tocHeads.length);
    markToc();
  }

  function markToc() {
    if (tocEl.hidden) return;
    const top = contentWrapper.getBoundingClientRect().top + 40;
    let cur = 0;
    tocHeads.forEach((h, i) => { if (h.getBoundingClientRect().top <= top) cur = i; });
    tocEl.querySelectorAll('a').forEach((a, i) => a.classList.toggle('active', i === cur));
  }

  /* ── Quick open: search every file by path ───────────────────────────── */
  let paletteHits = [];
  let paletteActive = 0;

  quickBtn.addEventListener('click', openPalette);
  paletteInput.addEventListener('input', () => renderPalette(paletteInput.value));
  paletteEl.addEventListener('click', (e) => {
    if (e.target === paletteEl) paletteEl.close(); // click on the backdrop
  });
  paletteList.addEventListener('click', (e) => {
    const row = e.target.closest('li[data-i]');
    if (row) choosePalette(Number(row.dataset.i));
  });
  paletteInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!paletteHits.length) return;
      paletteActive = (paletteActive + (e.key === 'ArrowDown' ? 1 : -1) + paletteHits.length) % paletteHits.length;
      markPalette();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choosePalette(paletteActive);
    }
  });

  function openPalette() {
    if (!rootHandle || paletteEl.open) return;
    paletteInput.value = '';
    renderPalette('');
    paletteEl.showModal();
  }

  function renderPalette(query) {
    paletteHits = query.trim() ? searchFiles(allFiles, query) : recentFiles();
    paletteActive = 0;
    const rows = paletteHits.map((file, i) => {
      const li = document.createElement('li');
      li.id = 'palette-opt-' + i;
      li.dataset.i = i;
      li.setAttribute('role', 'option');
      const name = document.createElement('span');
      name.className = 'p-name';
      name.textContent = file.name;
      const dir = document.createElement('span');
      dir.className = 'p-dir';
      dir.textContent = file.path.slice(1, -1).join('/');
      li.append(name, dir);
      return li;
    });
    if (!rows.length) {
      const empty = document.createElement('li');
      empty.className = 'p-empty';
      empty.textContent = query.trim() ? 'No file matches "' + query.trim() + '".' : 'Type part of a file or folder name.';
      rows.push(empty);
    }
    paletteList.replaceChildren(...rows);
    markPalette();
  }

  function markPalette() {
    paletteInput.removeAttribute('aria-activedescendant');
    paletteList.querySelectorAll('li[data-i]').forEach((li, i) => {
      const on = i === paletteActive;
      li.setAttribute('aria-selected', String(on));
      if (!on) return;
      paletteInput.setAttribute('aria-activedescendant', li.id);
      li.scrollIntoView({ block: 'nearest' });
    });
  }

  function choosePalette(i) {
    const file = paletteHits[i];
    if (!file) return;
    paletteEl.close();
    openPath(file.path, 'push');
  }

  function recentKey() {
    return 'doctree-recent:' + currentFolder.id;
  }

  function recentFiles() {
    const here = currentPath.slice(1).join('/');
    const rels = JSON.parse(localStorage.getItem(recentKey()) || '[]');
    return rels.filter((r) => r !== here).map((r) => allFiles.find((f) => f.rel === r)).filter(Boolean);
  }

  function rememberRecent(pathArr) {
    const rel = pathArr.slice(1).join('/');
    const rels = JSON.parse(localStorage.getItem(recentKey()) || '[]').filter((r) => r !== rel);
    localStorage.setItem(recentKey(), JSON.stringify([rel, ...rels].slice(0, RECENT_MAX)));
  }

  /* ── Navigation: links, history, deep links ──────────────────────────── */
  bodyEl.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[data-anchor]');
    if (anchor) {
      e.preventDefault();
      const id = anchor.dataset.anchor.slice(1);
      if (id) bodyEl.querySelector('#' + CSS.escape(id))?.scrollIntoView();
      return;
    }
    const a = e.target.closest('a[data-md-link]');
    if (!a || !rootHandle || !currentPath.length) return;
    e.preventDefault();
    openPath(resolvePathArray(currentPath, a.dataset.mdLink), 'push');
  });

  window.addEventListener('popstate', () => {
    const path = rootHandle && pathFromHash();
    if (path) openPath(path, null);
  });

  /** Path array from the URL hash (root-relative, slash separated), or null. */
  function pathFromHash() {
    const hash = location.hash.slice(1);
    return hash ? [rootHandle.name, ...hash.split('/').map(decodeURIComponent)] : null;
  }

  /** historyMode: 'push' adds a Back entry, 'replace' rewrites the current one, null leaves it. */
  async function openPath(pathArr, historyMode) {
    try {
      await loadFileHandle(await navigateToHandle(rootHandle, pathArr), pathArr);
    } catch (err) {
      console.warn('[Doctree] cannot open:', pathArr.join('/'), err);
      return;
    }
    highlightActiveByPath(pathArr);
    rememberRecent(pathArr);
    const hash = '#' + pathArr.slice(1).map(encodeURIComponent).join('/');
    if (historyMode === 'replace') history.replaceState(null, '', hash);
    else if (historyMode === 'push' && location.hash !== hash) history.pushState(null, '', hash);
  }

  /* ── Folders: pick, remember, switch ─────────────────────────────────── */
  openFolderBtn.addEventListener('click', openFolder);
  foldersMenu.addEventListener('click', async (e) => {
    const forget = e.target.closest('[data-forget]');
    if (forget) {
      await forgetFolder(forget.dataset.forget);
      fillFoldersMenu();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (!open) return;
    foldersMenu.hidePopover();
    if (open.dataset.open === 'new') openFolder();
    else openRecent(folders.find((f) => f.id === open.dataset.open));
  });

  function fillFoldersMenu() {
    const rows = folders.map((rec) => {
      const item = menuItem(rec.name, rec.base || 'Location not set', { open: rec.id });
      if (rec.id === currentFolder?.id) item.firstElementChild.append(textSpan('m-tag', 'open'));
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'm-x';
      x.dataset.forget = rec.id;
      x.title = 'Forget this folder';
      x.setAttribute('aria-label', 'Forget ' + rec.name);
      x.textContent = '×';
      const row = document.createElement('div');
      row.className = 'm-row';
      row.append(item, x);
      return row;
    });
    foldersMenu.replaceChildren(
      ...rows,
      ...(rows.length ? [document.createElement('hr')] : []),
      menuItem('Open another folder…', '', { open: 'new' }),
    );
  }

  async function openFolder() {
    let handle;
    try {
      handle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Doctree] openFolder:', err);
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    await showRoot(await adoptFolder(handle));
  }

  async function openRecent(rec) {
    if (!rec || rec.id === currentFolder?.id) return;
    const granted = await rec.handle.queryPermission({ mode: 'read' }) === 'granted'
      || await rec.handle.requestPermission({ mode: 'read' }) === 'granted';
    if (!granted) {
      bodyEl.textContent = 'Doctree needs read access to ' + rec.name + ' to open it.';
      return;
    }
    history.replaceState(null, '', location.pathname + location.search);
    rec.used = Date.now();
    await putFolder(rec);
    await refreshFolders();
    await showRoot(folders.find((f) => f.id === rec.id));
  }

  /** Reuse the saved record when the picked folder is already remembered; keep the newest FOLDERS_MAX. */
  async function adoptFolder(handle) {
    let rec;
    for (const saved of folders) {
      if (await saved.handle.isSameEntry(handle).catch(() => false)) {
        rec = saved;
        break;
      }
    }
    rec = rec ?? { id: crypto.randomUUID(), name: handle.name, handle, base: '' };
    rec.used = Date.now();
    await putFolder(rec);
    for (const old of folders.filter((f) => f.id !== rec.id).slice(FOLDERS_MAX - 1)) await forgetFolder(old.id);
    await refreshFolders();
    return folders.find((f) => f.id === rec.id);
  }

  async function forgetFolder(id) {
    await folderStore('readwrite', (store) => store.delete(id));
    localStorage.removeItem('doctree-recent:' + id);
    await refreshFolders();
  }

  async function restoreRoot() {
    await refreshFolders();
    const rec = folders[0];
    if (!rec) return;
    if (await rec.handle.queryPermission({ mode: 'read' }) === 'granted') {
      await showRoot(rec);
      return;
    }
    // requestPermission needs a click
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = 'Reopen ' + rec.name;
    btn.addEventListener('click', async () => {
      if (await rec.handle.requestPermission({ mode: 'read' }) === 'granted') await showRoot(rec);
    });
    bodyEl.replaceChildren(btn);
  }

  async function showRoot(rec) {
    currentFolder = rec;
    rootHandle = rec.handle;
    treeEl.innerHTML = '<span style="color:var(--muted);font-size:0.8em">Loading…</span>';
    setFolderUi(true);

    let tree;
    try {
      tree = await buildTree(rootHandle, [rootHandle.name]);
    } catch (err) {
      console.warn('[Doctree] cannot read folder:', err);
      currentFolder = null;
      rootHandle = null;
      setFolderUi(false);
      bodyEl.textContent = 'Could not read ' + rec.name + '. Click Open Folder to pick it again.';
      return;
    }
    renderTree(tree);
    startRescans();

    const fromHash = pathFromHash();
    const start = fromHash ?? findIndex(tree.children)?.path;
    if (start) {
      await openPath(start, fromHash ? null : 'replace');
    } else {
      bodyEl.textContent = 'No index file in ' + rec.name + '. Pick a file from the tree, or press '
        + (MAC ? '⌘K' : 'Ctrl K') + ' to search.';
    }
  }

  function setFolderUi(on) {
    sidebar.hidden = resizeHandle.hidden = treeToggleBtn.hidden = quickBtn.hidden = !on;
  }

  /* ── Saved folders (IndexedDB) ───────────────────────────────────────── */
  async function refreshFolders() {
    try {
      folders = (await folderStore('readonly', (store) => store.getAll())).sort((a, b) => b.used - a.used);
    } catch (err) {
      console.warn('[Doctree] cannot read saved folders:', err);
      folders = [];
    }
    if (currentFolder) currentFolder = folders.find((f) => f.id === currentFolder.id) ?? currentFolder;
  }

  function putFolder(rec) {
    return folderStore('readwrite', (store) => store.put(rec));
  }

  function folderStore(mode, run) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open('doctree', 2);
      open.onupgradeneeded = () => {
        const db = open.result;
        if (db.objectStoreNames.contains('kv')) db.deleteObjectStore('kv'); // version 1 kept one folder
        if (!db.objectStoreNames.contains('folders')) db.createObjectStore('folders', { keyPath: 'id' });
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction('folders', mode);
        const req = run(tx.objectStore('folders'));
        tx.oncomplete = () => {
          open.result.close();
          resolve(req.result);
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  /* ── Render tree ──────────────────────────────────────────────────────── */
  function renderTree(rootNode) {
    treeEl.innerHTML = '';
    filterEl.value = '';
    allFiles = flatten(rootNode);
    treeSig = allFiles.map((f) => f.rel).join('\n');
    if (!rootNode.children.length) {
      treeEl.textContent = 'No supported files found (.md, .json, .jsonl, .txt, .tsv, .csv, .html).';
      return;
    }
    // Header: folder name, then tools to collapse everything or find the open file
    const head = document.createElement('div');
    head.className = 'tree-head';
    head.append(
      textSpan('tree-root-label', rootNode.name),
      treeTool(ICON_COLLAPSE, 'Collapse all folders', collapseAll),
      treeTool(ICON_REVEAL, 'Show the open file in the tree', revealCurrent),
      treeTool(ICON_REFRESH, 'Rescan the folder for new files', () => rescan(true)),
    );
    treeEl.appendChild(head);
    treeEl.appendChild(buildUL(rootNode.children));
  }

  function icon(svg) {
    const template = document.createElement('template');
    template.innerHTML = svg;
    return template.content.firstElementChild;
  }

  function textSpan(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function buildUL(children) {
    const ul = document.createElement('ul');
    ul.className = 'tree-list';

    for (const child of children) {
      const li = document.createElement('li');

      if (child.type === 'dir') {
        if (!child.children.length) continue; // skip empty dirs
        const details = document.createElement('details');
        details.dataset.path = child.path.join('/');
        const summary = document.createElement('summary');
        summary.className = 'tree-dir';
        summary.title = child.name;
        summary.append(textSpan('chev', ''), icon(ICON_FOLDER), textSpan('name', child.name));
        summary.addEventListener('click', (e) => onDirClick(e, details, child));
        details.append(summary, buildUL(child.children));
        li.appendChild(details);
      } else {
        const btn = document.createElement('button');
        btn.className = 'tree-file';
        const dot = child.name.lastIndexOf('.');
        btn.append(
          icon(ICON_FILE),
          textSpan('name', dot > 0 ? child.name.slice(0, dot) : child.name),
          textSpan('ext', dot > 0 ? child.name.slice(dot) : ''),
        );
        btn.title = child.path.join('/');
        btn.dataset.path = JSON.stringify(child.path);
        btn.dataset.search = child.path.slice(1).join('/').toLowerCase();
        btn.addEventListener('click', () => openPath(child.path, 'push'));
        li.appendChild(btn);
      }

      ul.appendChild(li);
    }
    return ul;
  }

  /** Name click opens the folder's entry file and expands it; the chevron only expands or collapses. */
  function onDirClick(e, details, node) {
    e.preventDefault();
    const index = findIndex(node.children);
    const shown = index && index.path.join('/') === currentPath.join('/');
    if (index && !shown && !e.target.closest('.chev')) {
      details.open = true;
      openPath(index.path, 'push');
    } else {
      details.open = !details.open;
    }
  }

  function treeTool(svg, label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tree-tool';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.append(icon(svg));
    btn.addEventListener('click', onClick);
    return btn;
  }

  function collapseAll() {
    clearFilter();
    treeEl.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
  }

  function revealCurrent() {
    clearFilter();
    highlightActiveByPath(currentPath);
  }

  /* ── Rescan: pick up files added, renamed or removed on disk ─────────── */
  let rescansOn = false;

  function startRescans() {
    if (rescansOn) return;
    rescansOn = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) rescan();
    });
    window.addEventListener('focus', () => rescan());
    setTimeout(rescanLoop, RESCAN_MS);
  }

  async function rescanLoop() {
    const started = performance.now();
    if (!document.hidden) await rescan();
    // A slow scan (a huge folder) waits longer, so the loop stays cheap
    setTimeout(rescanLoop, Math.max(RESCAN_MS, (performance.now() - started) * 20));
  }

  async function rescan(force) {
    const root = rootHandle;
    if (!root || scanning || (!force && performance.now() - lastScanEnd < 2000)) return;
    scanning = true;
    try {
      const tree = await buildTree(root, [root.name]);
      if (root !== rootHandle) return; // the reader switched folders meanwhile
      if (flatten(tree).map((f) => f.rel).join('\n') === treeSig) return;
      redrawTree(tree);
    } catch (err) {
      console.warn('[Doctree] rescan failed:', err);
    } finally {
      scanning = false;
      lastScanEnd = performance.now();
    }
  }

  /** Redraw after a change, keeping folders open, the scroll position and the filter. */
  function redrawTree(tree) {
    const open = new Set([...treeEl.querySelectorAll('details[open]')].map((d) => d.dataset.path));
    const top = sidebar.scrollTop;
    const term = filterEl.value;
    renderTree(tree);
    treeEl.querySelectorAll('details').forEach((d) => { d.open = open.has(d.dataset.path); });
    highlightActiveByPath(currentPath);
    sidebar.scrollTop = top;
    if (term) {
      filterEl.value = term;
      filterEl.dispatchEvent(new Event('input'));
    }
  }

  /* ── Load file from FileSystemFileHandle ─────────────────────────────── */
  async function loadFileHandle(handle, pathArr) {
    revokeBlobUrls();

    try {
      const file = await handle.getFile();
      currentHandle = handle;
      currentStamp = stampOf(file);
      currentPath = pathArr;
      copyGroup.hidden = false;
      setTitle(handle.name);
      if (/\.md$/i.test(handle.name)) {
        await renderMarkdown(await file.text(), { mode: 'folder' });
        await resolveImages(pathArr);
      } else {
        await renderText(file);
      }
    } catch (err) {
      console.error('[Doctree] loadFileHandle:', err);
      bodyEl.textContent = 'Could not read the file: ' + err.message;
      buildToc();
    }

    contentWrapper.scrollTop = 0;
  }

  /* ── Load from chrome.storage.local (single-file mode) ───────────────── */
  function loadFromStorage(url) {
    const baseDir = url.substring(0, url.lastIndexOf('/') + 1);
    chrome.storage.local.get(url, async (result) => {
      if (chrome.runtime.lastError) {
        bodyEl.textContent = 'Storage error: ' + chrome.runtime.lastError.message;
        return;
      }

      let markdown = result[url];

      // Fallback: fetch the file directly (e.g. after a reload, once the unload
      // handler has already cleared storage)
      if (markdown == null) {
        try {
          const response = await fetch(url);
          markdown = await response.text();
        } catch (err) {
          bodyEl.textContent = 'Could not read the file: ' + err.message;
          return;
        }
      }

      await renderMarkdown(markdown, { mode: 'single', baseDir });
      contentWrapper.scrollTop = 0;
    });

    window.addEventListener('unload', () => {
      chrome.runtime.sendMessage({ type: 'REMOVE_STORAGE_KEY', key: url });
    });
  }

  /* ── Render markdown ──────────────────────────────────────────────────── */
  async function renderMarkdown(markdown, { mode, baseDir }) {
    const renderer = new marked.Renderer();

    if (mode === 'single') {
      renderer.image = function ({ href, title, text }) {
        const src = resolveUrl(href, baseDir);
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
        return `<img src="${escapeAttr(src)}" alt="${escapeAttr(text)}"${titleAttr}>`;
      };
      renderer.link = function ({ href, title, text }) {
        const resolved = resolveUrl(href, baseDir);
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
        const target = /^https?:/.test(resolved)
          ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttr(resolved)}"${titleAttr}${target}>${text}</a>`;
      };
    }

    if (mode === 'folder') {
      // Mark internal links for JS navigation; open external links in new tab
      renderer.link = function ({ href, title, text }) {
        const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
        const url = escapeAttr(href);
        if (/^https?:/.test(href)) {
          return `<a href="${url}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
        }
        if (href.startsWith('#')) return `<a href="${url}" data-anchor="${url}"${titleAttr}>${text}</a>`;
        if (LINK.test(href)) return `<a href="#" data-md-link="${url}"${titleAttr}>${text}</a>`;
        return `<a href="${url}"${titleAttr}>${text}</a>`;
      };
    }

    const { fields, body } = splitFrontmatter(markdown);
    bodyEl.innerHTML = marked.parse(body, { renderer, gfm: true, breaks: false });
    if (fields.length) bodyEl.prepend(frontmatterCard(fields));
    buildToc();

    // Convert fenced mermaid blocks
    bodyEl.querySelectorAll('pre > code.language-mermaid').forEach((codeEl) => {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = codeEl.textContent;
      codeEl.parentElement.replaceWith(div);
    });

    mermaid.initialize({
      startOnLoad: false,
      theme: isDark() ? 'dark' : 'default',
      securityLevel: 'loose',
    });
    await mermaid.run({ querySelector: '.mermaid' }).catch((err) => {
      console.error('[Doctree] mermaid:', err);
    });
  }

  /* ── Render non-markdown files as plain text ──────────────────────────── */
  async function renderText(file) {
    const pre = document.createElement('pre');
    const capped = file.size > TEXT_CAP;
    pre.textContent = await (capped ? file.slice(0, TEXT_CAP) : file).text();
    bodyEl.replaceChildren(pre);
    buildToc();
    if (!capped) return;

    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = `Showing the first ${TEXT_CAP / 1024} KB of ${Math.ceil(file.size / 1024)} KB. Show all`;
    btn.addEventListener('click', async () => {
      pre.textContent = await file.text();
      btn.remove();
    });
    bodyEl.append(btn);
  }

  function frontmatterCard(fields) {
    const card = document.createElement('div');
    card.className = 'fm';
    for (const [key, value] of fields) {
      const chip = document.createElement('span');
      const label = document.createElement('b');
      label.textContent = key;
      chip.append(label, value);
      if (key === 'status') chip.dataset.status = value;
      card.append(chip);
    }
    return card;
  }

  /* ── Resolve relative images in folder mode ───────────────────────────── */
  async function resolveImages(filePath) {
    if (!rootHandle) return;
    const imgs = bodyEl.querySelectorAll('img[src]');
    for (const img of imgs) {
      const src = img.getAttribute('src');
      if (!src || /^[a-z][a-z\d+\-.]*:/i.test(src) || src.startsWith('/')) continue;
      try {
        const imgPath = resolvePathArray(filePath, src);
        const handle  = await navigateToHandle(rootHandle, imgPath);
        const file    = await handle.getFile();
        const url     = URL.createObjectURL(file);
        blobUrls.push(url);
        img.src = url;
      } catch {
        // Image not found — leave broken src as-is
      }
    }
  }

  /* ── Highlight active tree item by path ──────────────────────────────── */
  function highlightActiveByPath(pathArr) {
    const key = JSON.stringify(pathArr);
    document.querySelectorAll('.tree-file').forEach((btn) => {
      const active = btn.dataset.path === key;
      btn.classList.toggle('active', active);
      if (!active) return;
      for (let d = btn.closest('details'); d; d = d.parentElement.closest('details')) d.open = true;
      btn.scrollIntoView({ block: 'nearest' });
    });
  }

  /* ── Helpers ──────────────────────────────────────────────────────────── */

  /** Navigate from a root FileSystemDirectoryHandle to a file/dir by path array. */
  async function navigateToHandle(rootDirHandle, pathArr) {
    // pathArr[0] is the root dir name itself, skip it
    let handle = rootDirHandle;
    for (let i = 1; i < pathArr.length - 1; i++) {
      handle = await handle.getDirectoryHandle(pathArr[i]);
    }
    return await handle.getFileHandle(pathArr[pathArr.length - 1]);
  }

  function isDark() {
    return document.documentElement.dataset.theme === 'dark';
  }

  function setTitle(name) {
    fileNameEl.textContent = name;
    document.title = name + ' — Doctree';
  }

  function revokeBlobUrls() {
    blobUrls.forEach(URL.revokeObjectURL, URL);
    blobUrls = [];
  }
})();
