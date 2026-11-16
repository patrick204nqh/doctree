// Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ICONS, shortcode } from '../viewer/emoji.js';

test('every icon name points at a bundled SVG', () => {
  for (const [name, [file]] of Object.entries(ICONS)) {
    assert.ok(existsSync(new URL(`../viewer/icons/${file}.svg`, import.meta.url)), name);
  }
});

test('shortcode: brand icon, emoji, and unknown names', () => {
  assert.deepEqual(shortcode('buildkite'), { file: 'buildkite', color: '#14CC80' });
  assert.equal(shortcode('rocket').char, '🚀');
  assert.equal(shortcode('+1').char, '👍');
  assert.equal(shortcode('toString'), null); // not an inherited property
  assert.equal(shortcode('nope'), null);
});
