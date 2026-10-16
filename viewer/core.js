/**
 * core.js
 * Pure logic with no DOM or Chrome APIs, so `node --test` can run it.
 * Loaded as an ES module by the viewer and by import in tests.
 */

/**
 * DOMPurify options for rendered Markdown. Scripts, handlers and javascript: URLs go by default.
 * This also drops <style> and <form> (a file could restyle or overlay the viewer) and allows
 * file: and chrome-extension: links, which single-file mode writes for relative images and links.
 */
export const PURIFY_CONFIG = {
  ADD_ATTR: ['target'],
  FORBID_TAGS: ['style', 'form'],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|file|blob|chrome-extension):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/** Every shown extension → [label shown in the toolbar, highlight.js language or null]. */
const FILE_TYPES = {
  md: ['Markdown', 'markdown'],
  json: ['JSON', 'json'], jsonl: ['JSON Lines', 'json'],
  csv: ['CSV', null], tsv: ['TSV', null],
  html: ['HTML', 'xml'], css: ['CSS', 'css'], xml: ['XML', 'xml'],
  txt: ['Text', null], log: ['Log', null],
  rb: ['Ruby', 'ruby'], py: ['Python', 'python'], js: ['JavaScript', 'javascript'], ts: ['TypeScript', 'typescript'],
  sh: ['Shell', 'bash'], rs: ['Rust', 'rust'], go: ['Go', 'go'], sql: ['SQL', 'sql'],
  yml: ['YAML', 'yaml'], yaml: ['YAML', 'yaml'], toml: ['TOML', 'ini'],
  svg: ['SVG', 'xml'],
  png: ['PNG', null], jpg: ['JPEG', null], jpeg: ['JPEG', null], gif: ['GIF', null], webp: ['WebP', null],
};
/** Shown as a picture. SVG is also text, so it keeps the Raw view; the rest are binary. */
export const IMAGE_EXTS = new Set(['svg', 'png', 'jpg', 'jpeg', 'gif', 'webp']);
const EXTENSIONS = Object.keys(FILE_TYPES);
const EXT_PATTERN = EXTENSIONS.join('|');
export const SHOWN = new RegExp(`\\.(${EXT_PATTERN})$`, 'i');
/** A link that stays inside the open folder: no scheme ("https:", "mailto:"), not "/abs", not "#top". */
export const isRelativeLink = (href) => !/^([a-z][a-z\d+\-.]*:|\/|#)/i.test(href);
export const EXT_LABEL = EXTENSIONS.map((e) => '.' + e).join(', ');

/** "run.rb" → { ext: "rb", label: "Ruby", lang: "ruby" }. An unknown type reads as plain "Text". */
export function fileInfo(name) {
  const ext = splitName(name)[1].slice(1).toLowerCase();
  const [label, lang] = Object.hasOwn(FILE_TYPES, ext) ? FILE_TYPES[ext] : ['Text', null];
  return { ext, label, lang };
}

/** 900 → "900 B", 4300 → "4.2 KB", 3 MB → "3.0 MB". */
export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

/**
 * JSON re-indented. For JSONL each record is indented and records are split by a blank line.
 * Text that does not parse stays as it is.
 */
export function prettyJson(text, lines = false) {
  const fmt = (s) => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
  return lines ? text.split(/\r?\n/).filter((l) => l.trim()).map(fmt).join('\n\n') : fmt(text);
}

/** CSV or TSV text → rows of cells. Handles "quoted, cells", "" escapes and line breaks inside quotes. */
export function parseDelimited(text, delim) {
  const s = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (s[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delim) {
      row.push(cell); cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const FM_SKIP = new Set(['schema', 'key']);                // front matter keys not worth a chip
const INDEX_NAMES = ['index.md', 'readme.md', 'task.md'];  // a folder's entry file, first match wins
const IGNORED_DIRS = new Set(['node_modules', '__pycache__']);

/** Leading "---" fence with simple "key: value" lines. Nested or list values are skipped. */
export function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { fields: [], body: text };
  const fields = [];
  for (const line of m[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_][\w-]*):[ \t]*(\S.*)$/);
    if (pair && !FM_SKIP.has(pair[1]) && !/^[[{]/.test(pair[2])) fields.push([pair[1], pair[2].trim()]);
  }
  return { fields, body: text.slice(m[0].length) };
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Resolve a relative link against the path array of the file that holds it.
 * basePath: ["root", "docs", "page.md"], href: "../img/a%20b.png" → ["root", "img", "a b.png"].
 * Query and hash are dropped, %-escapes decoded, and ".." never climbs above the root.
 */
export function resolvePathArray(basePath, href) {
  const result = basePath.slice(0, -1);
  for (const raw of href.split(/[?#]/)[0].split('/')) {
    const part = safeDecode(raw);
    if (part === '..') {
      if (result.length > 1) result.pop();
    } else if (part && part !== '.') {
      result.push(part);
    }
  }
  return result;
}

/** Single-file mode: make a relative URL absolute against the file's folder. */
export function resolveUrl(href, base) {
  if (!href) return '';
  if (/^[a-z][a-z\d+\-.]*:/i.test(href) || href.startsWith('/') || href.startsWith('#')) return href;
  return base + href;
}

export function escapeAttr(str) {
  return (str ?? '').replace(/[&"<>]/g, (c) =>
    ({ '&': '&amp;', '"': '&quot;', '<': '&lt;', '>': '&gt;' }[c]));
}

/** The entry file of a folder (index.md, then README.md, then task.md), or null. */
export function findIndex(children) {
  for (const name of INDEX_NAMES) {
    const hit = children.find((c) => c.type === 'file' && c.name.toLowerCase() === name);
    if (hit) return hit;
  }
  return null;
}

/** The order the tree lists a folder in: entry file, then folders, then the other files. */
function orderEntries(dirs, files) {
  const index = findIndex(files);
  return [...(index ? [index] : []), ...dirs, ...files.filter((f) => f !== index)];
}

const inFolder = (f, folderPath) => f.path.length > folderPath.length && folderPath.every((p, i) => f.path[i] === p);

/** The first file under a folder in tree order (its entry file when it has one), or null. */
export function firstFileIn(files, folderPath) {
  return files.find((f) => inFolder(f, folderPath)) ?? null;
}

/**
 * Where a relative link points in the open folder: { path, anchor } or null when nothing is there.
 * A folder link opens its first file (the entry file when it has one); "a.md#sec" keeps "sec".
 */
export function resolveLink(files, basePath, href) {
  const path = resolvePathArray(basePath, href);
  const same = (p) => p.length === path.length && p.every((s, i) => s === path[i]);
  const hit = files.find((f) => same(f.path)) ?? firstFileIn(files, path);
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
  return hit ? { path: hit.path, anchor: safeDecode(hash) } : null;
}

/** What a folder holds, as the tree lists it. */
export function folderItems(files, folderPath) {
  const n = folderPath.length;
  const dirs = new Map();
  const here = [];
  for (const f of files.filter((f) => inFolder(f, folderPath))) {
    if (f.path.length === n + 1) here.push({ type: 'file', name: f.name, path: f.path });
    else if (!dirs.has(f.path[n])) dirs.set(f.path[n], { type: 'dir', name: f.path[n], path: f.path.slice(0, n + 1) });
  }
  return orderEntries([...dirs.values()], here);
}

/**
 * Read a directory handle into { name, type, path, children }.
 * Folders first (A–Z), then files (A–Z); the entry file leads. Dot-names and build dirs are skipped.
 */
export async function buildTree(dirHandle, pathArr) {
  const node = { name: dirHandle.name, type: 'dir', path: pathArr, children: [] };
  const dirs = [], files = [];

  for await (const [name, handle] of dirHandle) {
    if (name.startsWith('.') || IGNORED_DIRS.has(name)) continue;
    const childPath = [...pathArr, name];
    if (handle.kind === 'directory') {
      dirs.push(await buildTree(handle, childPath));
    } else if (handle.kind === 'file' && SHOWN.test(name)) {
      files.push({ name, type: 'file', handle, path: childPath });
    }
  }

  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  node.children = orderEntries(dirs, files);
  return node;
}

/** Every file of the tree as a flat list, for quick open. */
export function flatten(node, out = []) {
  for (const c of node.children) {
    if (c.type === 'dir') {
      flatten(c, out);
    } else {
      const rel = c.path.slice(1).join('/');
      out.push({ name: c.name, path: c.path, rel, search: rel.toLowerCase() });
    }
  }
  return out;
}

/** Fingerprint of a file on disk: changes when the file is edited. */
export const stampOf = (file) => file.lastModified + ':' + file.size;

/** The shown files' paths as one string, to tell whether a rescan found a file added, renamed or removed. */
export const signature = (files) => files.map((f) => f.rel).join('\n');

/** All words must appear in the path; files whose name matches come first, then shorter paths. */
export function searchFiles(files, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const nameHits = (f) => words.filter((w) => f.name.toLowerCase().includes(w)).length;
  return files
    .filter((f) => words.every((w) => f.search.includes(w)))
    .sort((a, b) => nameHits(b) - nameHits(a) || a.search.length - b.search.length)
    .slice(0, 50);
}

/** One unique GitHub-style id per heading text: "My Title" → "my-title", a repeat → "my-title-1". */
export function headingIds(texts) {
  const seen = new Map();
  return texts.map((t) => {
    const base = t.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-') || 'section';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? base + '-' + n : base;
  });
}

/** Recent file paths (root-relative), newest first, without repeats, capped at max. */
export function pushRecent(rels, rel, max) {
  return [rel, ...rels.filter((r) => r !== rel)].slice(0, max);
}

/** Recent paths as flat-list files: the open file and files that no longer exist are left out. */
export function recentFiles(rels, openRel, files) {
  return rels.filter((r) => r !== openRel).map((r) => files.find((f) => f.rel === r)).filter(Boolean);
}

/** A folder's location typed by the reader: trailing slashes dropped; null unless it is a full path. */
export function parseBase(input) {
  const base = input.trim().replace(/[\\/]+$/, '');
  return /^(\/|[A-Za-z]:[\\/])/.test(base) ? base : null;
}

/** "#a/b%20c.md" ↔ ["root", "a", "b c.md"]: the address bar hash is the path below the root folder. */
export function pathToHash(pathArr) {
  return '#' + pathArr.slice(1).map(encodeURIComponent).join('/');
}

export function hashToPath(hash, rootName) {
  const rel = hash.slice(1);
  return rel ? [rootName, ...rel.split('/').map(decodeURIComponent)] : null;
}

/** "notes.md" → ["notes", ".md"]; a dotfile or a name with no dot keeps its whole name. */
export function splitName(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
}

/* ── Trusted sites: embeds and hover cards for links ──────────────────────── */

/** A site also covers its subdomains: "wikipedia.org" covers "en.wikipedia.org". */
export const DEFAULT_SITES = ['youtube.com', 'youtu.be', 'vimeo.com', 'loom.com', 'github.com', 'wikipedia.org'];

/** "https://www.GitHub.com/a, youtube.com" → ["github.com", "youtube.com"]: hosts only, one per entry. */
export const parseSites = (text) => [...new Set(
  text.toLowerCase().split(/[\s,]+/).map((s) => s.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(Boolean),
)];

const SEG = /^[\w.-]+$/;

/**
 * How a link to a trusted site previews, or null when the site is not trusted:
 * { site, card: { url, kind } } a public JSON API to read a hover card from (video: true for a video link, which can also
 * stand alone on its line as a thumbnail card), or { site } a trusted site with nothing to preview.
 */
export function previewFor(href, sites) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, '');
  const site = sites.find((s) => host === s || host.endsWith('.' + s));
  if (!site) return null;
  const seg = u.pathname.split('/').filter(Boolean);
  const id = (re, v) => (v && re.test(v) ? v : null);
  const video = (api) => ({ site, video: true, card: { url: api, kind: 'video' } });
  const oembed = (base, page) => `${base}${encodeURIComponent(page)}`;

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com') {
    const v = host === 'youtu.be' ? seg[0] : seg[0] === 'watch' ? u.searchParams.get('v') : ['shorts', 'embed', 'live'].includes(seg[0]) ? seg[1] : null;
    const yt = id(/^[\w-]{11}$/, v);
    return yt ? video(oembed('https://www.youtube.com/oembed?format=json&url=', `https://www.youtube.com/watch?v=${yt}`)) : { site };
  }
  if (host === 'vimeo.com') {
    const vimeo = id(/^\d+$/, seg[0]);
    return vimeo ? video(oembed('https://vimeo.com/api/oembed.json?url=', `https://vimeo.com/${vimeo}`)) : { site };
  }
  if (host === 'loom.com') {
    const loom = seg[0] === 'share' && id(/^\w+$/, seg[1]);
    return loom ? video(oembed('https://www.loom.com/v1/oembed?url=', `https://www.loom.com/share/${loom}`)) : { site };
  }
  if (host === 'github.com' && seg.length >= 2 && SEG.test(seg[0]) && SEG.test(seg[1])) {
    const repo = `https://api.github.com/repos/${seg[0]}/${seg[1]}`;
    if (seg.length === 2) return { site, card: { url: repo, kind: 'github' } };
    if ((seg[2] === 'issues' || seg[2] === 'pull') && /^\d+$/.test(seg[3] ?? '')) return { site, card: { url: `${repo}/issues/${seg[3]}`, kind: 'github' } };
  }
  if (/^[a-z-]+\.wikipedia\.org$/.test(host) && seg[0] === 'wiki' && seg[1]) {
    return { site, card: { url: `https://${host}/api/rest_v1/page/summary/${seg[1]}`, kind: 'wikipedia' } };
  }
  return { site };
}

/** The JSON a card API returned → { title, text, meta } as plain strings (shown with textContent, never as HTML); a video adds its https thumbnail URL as image. */
export function cardText(kind, d) {
  if (kind === 'video') return { title: d.title ?? '', text: '', meta: [d.author_name, d.provider_name].filter(Boolean).join(' · '), image: /^https:\/\//.test(d.thumbnail_url) ? d.thumbnail_url : '' };
  if (kind === 'wikipedia') return { title: d.title ?? '', text: d.extract ?? '', meta: d.description ?? '' };
  if (d.number) { // a GitHub issue or pull request
    return { title: `#${d.number} ${d.title}`, text: '', meta: [d.pull_request ? 'Pull request' : 'Issue', d.state, d.user?.login].filter(Boolean).join(' · ') };
  }
  return { title: d.full_name ?? '', text: d.description ?? '', meta: [`★ ${d.stargazers_count ?? 0}`, d.language].filter(Boolean).join(' · ') };
}

/** "64 × 64" from an SVG's width and height, else its viewBox; null when it declares neither (or units other than px). */
export function svgSize(text) {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attr = (name) => new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];
  const px = (v) => (/^\s*\d+(\.\d+)?(px)?\s*$/.test(v ?? '') ? parseFloat(v) : null);
  const [w, h] = [px(attr('width')), px(attr('height'))];
  if (w && h) return `${w} × ${h}`;
  const vb = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  return vb?.length === 4 && vb[2] > 0 && vb[3] > 0 ? `${vb[2]} × ${vb[3]}` : null;
}
