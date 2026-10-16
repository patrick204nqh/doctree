/**
 * core.js
 * Pure logic with no DOM or Chrome APIs, so `node --test` can run it.
 * Loaded as an ES module by the viewer and by import in tests.
 */
const EXTENSIONS = ['md', 'json', 'jsonl', 'txt', 'tsv', 'csv', 'html'];
const EXT_PATTERN = EXTENSIONS.join('|');
export const SHOWN = new RegExp(`\\.(${EXT_PATTERN})$`, 'i');
export const LINK = new RegExp(`\\.(${EXT_PATTERN})([#?].*)?$`, 'i');
export const EXT_LABEL = EXTENSIONS.map((e) => '.' + e).join(', ');
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
