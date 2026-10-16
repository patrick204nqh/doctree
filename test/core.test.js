// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../viewer/core.js';

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
    file('archive.zip'), file('notes.JSON'), file('a.md'),
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

test('isRelativeLink: folder links count, schemes, absolute paths and #anchors do not', () => {
  assert.ok(C.isRelativeLink('flows/'));
  assert.ok(C.isRelativeLink('../a/b.md#sec'));
  assert.ok(!C.isRelativeLink('https://x.dev'));
  assert.ok(!C.isRelativeLink('mailto:a@b.c'));
  assert.ok(!C.isRelativeLink('/abs/a.md'));
  assert.ok(!C.isRelativeLink('#top'));
});

const sample = () => C.buildTree(dir('r', [
  file('README.md'), file('z.md'),
  dir('a', [file('b.md'), dir('deep', [file('d.md')]), file('task.md')]),
  dir('b', [file('x.md')]),
  dir('c', [dir('sub', [file('s.md')]), file('late.md')]),
]), ['r']).then(C.flatten);

test('resolveLink: file, folder (entry file), anchor, and links that point at nothing', async () => {
  const flat = await sample();
  const from = ['r', 'a', 'b.md'];
  assert.deepEqual(C.resolveLink(flat, from, 'task.md'), { path: ['r', 'a', 'task.md'], anchor: '' });
  assert.deepEqual(C.resolveLink(flat, from, '../b/'), { path: ['r', 'b', 'x.md'], anchor: '' });
  assert.deepEqual(C.resolveLink(flat, from, 'deep'), { path: ['r', 'a', 'deep', 'd.md'], anchor: '' });
  assert.deepEqual(C.resolveLink(flat, from, '../z.md#My%20Part'), { path: ['r', 'z.md'], anchor: 'My Part' });
  assert.equal(C.resolveLink(flat, from, 'missing/'), null);
  assert.equal(C.resolveLink(flat, from, 'pic.png'), null);
});

test('firstFileIn: the entry file when there is one, else the first file in tree order', async () => {
  const flat = await sample();
  assert.deepEqual(C.firstFileIn(flat, ['r']).path, ['r', 'README.md']);
  assert.deepEqual(C.firstFileIn(flat, ['r', 'a']).path, ['r', 'a', 'task.md']);       // task.md is a's entry file
  assert.deepEqual(C.firstFileIn(flat, ['r', 'b']).path, ['r', 'b', 'x.md']);
  assert.deepEqual(C.firstFileIn(flat, ['r', 'c']).path, ['r', 'c', 'sub', 's.md']);   // no entry file: subfolders come first
  assert.equal(C.firstFileIn(flat, ['r', 'nope']), null);
});

test('firstFileIn: a folder does not match a sibling that shares its name prefix', () => {
  const files = [{ path: ['r', 'ab', 'x.md'] }];
  assert.equal(C.firstFileIn(files, ['r', 'a']), null);
});

test('folderItems: entry file, then subfolders, then files, one level deep', async () => {
  const flat = await sample();
  assert.deepEqual(
    C.folderItems(flat, ['r']).map((i) => i.type + ':' + i.name),
    ['file:README.md', 'dir:a', 'dir:b', 'dir:c', 'file:z.md'],
  );
  assert.deepEqual(
    C.folderItems(flat, ['r', 'a']).map((i) => i.type + ':' + i.name),
    ['file:task.md', 'dir:deep', 'file:b.md'],
  );
  assert.deepEqual(C.folderItems(flat, ['r', 'a'])[1].path, ['r', 'a', 'deep']);
  assert.deepEqual(C.folderItems(flat, ['r', 'nope']), []);
});

test('pushRecent: newest first, no repeats, capped', () => {
  assert.deepEqual(C.pushRecent(['a', 'b', 'c'], 'b', 3), ['b', 'a', 'c']);
  assert.deepEqual(C.pushRecent(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
});

test('recentFiles: leaves out the open file and files that no longer exist', () => {
  const files = [{ rel: 'a.md' }, { rel: 'b.md' }];
  assert.deepEqual(C.recentFiles(['b.md', 'gone.md', 'a.md'], 'a.md', files), [{ rel: 'b.md' }]);
});

test('parseBase: needs a full path; trailing slashes are dropped', () => {
  assert.equal(C.parseBase(' /Users/me/notes// '), '/Users/me/notes');
  assert.equal(C.parseBase('C:\\Users\\me\\'), 'C:\\Users\\me');
  assert.equal(C.parseBase('notes'), null);
  assert.equal(C.parseBase('/'), null);
});

test('pathToHash and hashToPath: round-trip names with spaces and # characters', () => {
  const path = ['root', 'my docs', 'a#b.md'];
  assert.equal(C.pathToHash(path), '#my%20docs/a%23b.md');
  assert.deepEqual(C.hashToPath(C.pathToHash(path), 'root'), path);
  assert.equal(C.hashToPath('', 'root'), null);
  assert.equal(C.hashToPath('#', 'root'), null);
});

test('splitName: a dotfile or a name with no dot keeps its whole name', () => {
  assert.deepEqual(C.splitName('notes.v2.md'), ['notes.v2', '.md']);
  assert.deepEqual(C.splitName('.env'), ['.env', '']);
  assert.deepEqual(C.splitName('LICENSE'), ['LICENSE', '']);
});

test('fileInfo: label and highlight language by extension, plain Text for the rest', () => {
  assert.deepEqual(C.fileInfo('run.RB'), { ext: 'rb', label: 'Ruby', lang: 'ruby' });
  assert.deepEqual(C.fileInfo('README.md'), { ext: 'md', label: 'Markdown', lang: 'markdown' }); // raw view highlights it
  assert.deepEqual(C.fileInfo('a.yml'), { ext: 'yml', label: 'YAML', lang: 'yaml' });
  assert.deepEqual(C.fileInfo('notes.txt'), { ext: 'txt', label: 'Text', lang: null });
  assert.deepEqual(C.fileInfo('x.constructor'), { ext: 'constructor', label: 'Text', lang: null });
  assert.deepEqual(C.fileInfo('Makefile'), { ext: '', label: 'Text', lang: null });
});

test('SHOWN: scripts, config files and images are listed, other binaries are not', () => {
  for (const n of ['a.rb', 'a.py', 'a.sh', 'a.yaml', 'a.toml', 'a.HTML', 'a.svg', 'a.PNG', 'a.jpeg', 'a.webp']) assert.ok(C.SHOWN.test(n), n);
  assert.ok(!C.SHOWN.test('a.zip'));
  assert.ok(C.IMAGE_EXTS.has(C.fileInfo('logo.PNG').ext));
});

test('formatSize: bytes, KB, MB', () => {
  assert.equal(C.formatSize(900), '900 B');
  assert.equal(C.formatSize(4300), '4.2 KB');
  assert.equal(C.formatSize(3 * 1024 * 1024), '3.0 MB');
});

test('prettyJson: indents JSON, indents each JSONL record, leaves broken text alone', () => {
  assert.equal(C.prettyJson('{"a":[1,2]}'), '{\n  "a": [\n    1,\n    2\n  ]\n}');
  assert.equal(C.prettyJson('{"a":1}\n\n{"b":2}\n', true), '{\n  "a": 1\n}\n\n{\n  "b": 2\n}');
  assert.equal(C.prettyJson('{"a":1} trailing'), '{"a":1} trailing');
  assert.equal(C.prettyJson('{"a":1}\nnot json', true), '{\n  "a": 1\n}\n\nnot json');
});

test('parseDelimited: quotes, escaped quotes, line breaks in cells, CRLF, BOM, blank lines', () => {
  assert.deepEqual(C.parseDelimited('a,b\n1,2\n', ','), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(C.parseDelimited('\uFEFFname,note\r\n"Smith, J","say ""hi"""\r\n', ','), [['name', 'note'], ['Smith, J', 'say "hi"']]);
  assert.deepEqual(C.parseDelimited('a,b\n"line1\nline2",x', ','), [['a', 'b'], ['line1\nline2', 'x']]);
  assert.deepEqual(C.parseDelimited('a\tb\n\n1\t\n', '\t'), [['a', 'b'], ['1', '']]);
  assert.deepEqual(C.parseDelimited('', ','), []);
});

test('signature: changes when a file is added, renamed or removed, not when one is only edited', async () => {
  const sig = async (...entries) => C.signature(C.flatten(await C.buildTree(dir('r', entries), ['r'])));
  const base = await sig(file('a.md'), dir('d', [file('b.md')]));
  assert.equal(await sig(file('a.md'), dir('d', [file('b.md')])), base);
  assert.notEqual(await sig(file('a.md'), file('c.md'), dir('d', [file('b.md')])), base);
  assert.notEqual(await sig(file('a.md'), dir('d', [file('b2.md')])), base);
  assert.notEqual(await sig(file('a.md')), base);
});

test('stampOf: changes with modified time or size', () => {
  const s = C.stampOf({ lastModified: 1000, size: 5 });
  assert.notEqual(C.stampOf({ lastModified: 1001, size: 5 }), s);
  assert.notEqual(C.stampOf({ lastModified: 1000, size: 6 }), s);
  assert.equal(C.stampOf({ lastModified: 1000, size: 5 }), s);
});

test('parseSites: hosts only, www and scheme and paths dropped, no repeats', () => {
  assert.deepEqual(C.parseSites('https://www.GitHub.com/a/b, youtube.com\n\nyoutube.com'), ['github.com', 'youtube.com']);
  assert.deepEqual(C.parseSites('  '), []);
});

test('previewFor: video, GitHub and Wikipedia links get a card API, unknown sites are null', () => {
  const S = C.DEFAULT_SITES;
  const yt = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  for (const h of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 'https://youtu.be/dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ']) {
    assert.deepEqual(C.previewFor(h, S).card, { url: yt, kind: 'video' }, h);
    assert.equal(C.previewFor(h, S).video, true);
  }
  assert.equal(C.previewFor('https://youtube.com/watch?v=short', S).card, undefined);
  assert.equal(C.previewFor('https://vimeo.com/76979871', S).card.url, 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent('https://vimeo.com/76979871'));
  assert.equal(C.previewFor('https://www.loom.com/share/abc123', S).card.url, 'https://www.loom.com/v1/oembed?url=' + encodeURIComponent('https://www.loom.com/share/abc123'));
  assert.equal(C.previewFor('https://github.com/a/b', S).video, undefined);
  assert.deepEqual(C.previewFor('https://github.com/a/b', S).card, { url: 'https://api.github.com/repos/a/b', kind: 'github' });
  assert.equal(C.previewFor('https://github.com/a/b/pull/7', S).card.url, 'https://api.github.com/repos/a/b/issues/7');
  assert.equal(C.previewFor('https://github.com/a/b/blob/main/x.md', S).card, undefined);
  assert.equal(C.previewFor('https://en.wikipedia.org/wiki/Markdown', S).card.url, 'https://en.wikipedia.org/api/rest_v1/page/summary/Markdown');
  assert.equal(C.previewFor('https://example.com/', S), null);
  assert.equal(C.previewFor('javascript:alert(1)', S), null);
});

test('previewFor: only listed sites, and a lookalike host is not trusted', () => {
  assert.equal(C.previewFor('https://github.com/a/b', ['youtube.com']), null);
  assert.equal(C.previewFor('https://github.com.evil.io/a/b', C.DEFAULT_SITES), null);
  assert.equal(C.previewFor('https://notgithub.com/a/b', C.DEFAULT_SITES), null);
  assert.deepEqual(C.previewFor('https://example.com/x', ['example.com']), { site: 'example.com' });
});

test('cardText: repo, issue, Wikipedia and video results become plain strings', () => {
  assert.deepEqual(C.cardText('github', { full_name: 'a/b', description: 'd', stargazers_count: 3, language: 'JS' }), { title: 'a/b', text: 'd', meta: '★ 3 · JS' });
  assert.deepEqual(C.cardText('github', { number: 7, title: 'Fix', state: 'open', pull_request: {}, user: { login: 'me' } }), { title: '#7 Fix', text: '', meta: 'Pull request · open · me' });
  assert.deepEqual(C.cardText('wikipedia', { title: 'Markdown', extract: 'A markup language', description: 'Language' }), { title: 'Markdown', text: 'A markup language', meta: 'Language' });
  assert.deepEqual(C.cardText('video', { title: 'T', author_name: 'Me', provider_name: 'YouTube', thumbnail_url: 'https://i.ytimg.com/x.jpg' }), { title: 'T', text: '', meta: 'Me · YouTube', image: 'https://i.ytimg.com/x.jpg' });
  assert.equal(C.cardText('video', { title: 'T', thumbnail_url: 'javascript:1' }).image, '');
});

test('svgSize: width and height win, then viewBox; units or no size give null', () => {
  assert.equal(C.svgSize('<svg xmlns="x" width="120px" height="80" viewBox="0 0 1 1">'), '120 × 80');
  assert.equal(C.svgSize('<?xml version="1.0"?><svg viewBox="0 0 64 48" stroke-width="3">'), '64 × 48');
  assert.equal(C.svgSize("<svg viewBox='0,0,10.5,20'>"), '10.5 × 20');
  assert.equal(C.svgSize('<svg width="50%" height="10em">'), null);
  assert.equal(C.svgSize('not svg'), null);
});
