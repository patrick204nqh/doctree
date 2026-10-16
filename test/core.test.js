// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../viewer/core.js');

const file = (name) => ({ kind: 'file', name });
const dir = (name, entries) => ({
  kind: 'directory', name,
  async *[Symbol.asyncIterator]() { for (const e of entries) yield [e.name, e]; },
});
const names = (node) => node.children.map((c) => c.name);

test('buildTree: entry file first, then folders, then files, each A–Z', async () => {
  const root = dir('root', [
    file('zeta.md'), file('README.md'), file('alpha.txt'), dir('b', [file('x.md')]), dir('a', [file('y.md')]),
  ]);
  assert.deepEqual(names(await C.buildTree(root, ['root'])), ['README.md', 'a', 'b', 'alpha.txt', 'zeta.md']);
});

test('buildTree: index.md beats README.md beats task.md', async () => {
  const root = dir('r', [file('task.md'), file('README.md'), file('index.md')]);
  assert.equal((await C.buildTree(root, ['r'])).children[0].name, 'index.md');
});

test('buildTree: skips dot names, build dirs and unsupported files', async () => {
  const root = dir('r', [
    file('.hidden.md'), dir('.git', [file('a.md')]), dir('node_modules', [file('a.md')]),
    file('image.png'), file('notes.JSON'), file('a.md'),
  ]);
  assert.deepEqual(names(await C.buildTree(root, ['r'])), ['a.md', 'notes.JSON']);
});

test('buildTree: paths include every ancestor name', async () => {
  const tree = await C.buildTree(dir('r', [dir('d', [file('f.md')])]), ['r']);
  assert.deepEqual(tree.children[0].children[0].path, ['r', 'd', 'f.md']);
});

test('flatten: lists files only, with a root-relative path to search', async () => {
  const tree = await C.buildTree(dir('r', [dir('Docs', [file('Intro.md')]), file('a.md')]), ['r']);
  const flat = C.flatten(tree);
  assert.deepEqual(flat.map((f) => f.rel).sort(), ['Docs/Intro.md', 'a.md']);
  assert.equal(flat.find((f) => f.name === 'Intro.md').search, 'docs/intro.md');
});

test('searchFiles: every word must match the path; name matches rank first', () => {
  const files = ['docs/setup/guide.md', 'setup.md', 'docs/other.md']
    .map((rel) => ({ name: rel.split('/').pop(), rel, search: rel.toLowerCase() }));
  assert.deepEqual(C.searchFiles(files, 'setup').map((f) => f.rel), ['setup.md', 'docs/setup/guide.md']);
  assert.deepEqual(C.searchFiles(files, 'DOCS guide').map((f) => f.rel), ['docs/setup/guide.md']);
  assert.deepEqual(C.searchFiles(files, 'nomatch'), []);
});

test('searchFiles: a blank query returns nothing (the caller shows recent files)', () => {
  assert.deepEqual(C.searchFiles([{ name: 'a', search: 'a' }], '   '), []);
});

test('searchFiles: caps results at 50', () => {
  const files = Array.from({ length: 80 }, (_, i) => ({ name: `f${i}.md`, search: `f${i}.md` }));
  assert.equal(C.searchFiles(files, 'f').length, 50);
});

test('resolvePathArray: relative, parent and current-dir segments', () => {
  const base = ['root', 'docs', 'page.md'];
  assert.deepEqual(C.resolvePathArray(base, 'other.md'), ['root', 'docs', 'other.md']);
  assert.deepEqual(C.resolvePathArray(base, './sub/a.md'), ['root', 'docs', 'sub', 'a.md']);
  assert.deepEqual(C.resolvePathArray(base, '../img/fig.png'), ['root', 'img', 'fig.png']);
});

test('resolvePathArray: drops query and hash, decodes %-escapes', () => {
  const base = ['root', 'page.md'];
  assert.deepEqual(C.resolvePathArray(base, 'my%20file.md#top'), ['root', 'my file.md']);
  assert.deepEqual(C.resolvePathArray(base, 'a.md?x=1'), ['root', 'a.md']);
  assert.deepEqual(C.resolvePathArray(base, '100%.md'), ['root', '100%.md']); // malformed escape stays literal
});

test('resolvePathArray: ".." never climbs above the root folder', () => {
  assert.deepEqual(C.resolvePathArray(['root', 'a', 'p.md'], '../../../x.md'), ['root', 'x.md']);
});

test('resolveUrl: keeps absolute, root and #anchor URLs; joins the rest to the base', () => {
  const base = 'file:///notes/';
  assert.equal(C.resolveUrl('https://x.test/a', base), 'https://x.test/a');
  assert.equal(C.resolveUrl('/abs.png', base), '/abs.png');
  assert.equal(C.resolveUrl('#section', base), '#section');
  assert.equal(C.resolveUrl('img/a.png', base), 'file:///notes/img/a.png');
  assert.equal(C.resolveUrl('', base), '');
});

test('splitFrontmatter: reads simple key: value lines and strips the block', () => {
  const { fields, body } = C.splitFrontmatter('---\nstatus: live\ntitle:  Hello world \n---\n# Body\n');
  assert.deepEqual(fields, [['status', 'live'], ['title', 'Hello world']]);
  assert.equal(body, '# Body\n');
});

test('splitFrontmatter: skips noisy keys, lists and objects; handles CRLF', () => {
  const { fields } = C.splitFrontmatter('---\r\nschema: 3\r\nkey: K\r\ntags: [a, b]\r\nmeta: {a: 1}\r\nowner: me\r\n---\r\nx');
  assert.deepEqual(fields, [['owner', 'me']]);
});

test('splitFrontmatter: text without a leading fence is untouched', () => {
  const text = 'intro\n---\nstatus: live\n---\n';
  assert.deepEqual(C.splitFrontmatter(text), { fields: [], body: text });
});

test('headingIds: GitHub-style slugs, repeats get -1, -2', () => {
  assert.deepEqual(
    C.headingIds(['Hello, World!', 'Setup', 'Setup', 'Setup', 'Café ☕', '!!!']),
    ['hello-world', 'setup', 'setup-1', 'setup-2', 'café-', 'section'], // "café-": GitHub keeps the hyphen left by a dropped symbol
  );
});

test('escapeAttr: escapes quotes and angle brackets; tolerates null', () => {
  assert.equal(C.escapeAttr('a"b<c>&d'), 'a&quot;b&lt;c&gt;&amp;d');
  assert.equal(C.escapeAttr(undefined), '');
});

test('LINK: matches supported files with optional query or hash, not web pages', () => {
  assert.ok(C.LINK.test('a/b.md#sec'));
  assert.ok(C.LINK.test('data.JSONL?x=1'));
  assert.ok(!C.LINK.test('image.png'));
  assert.ok(!C.LINK.test('#top'));
});
