import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSearchFilter, escapeRegex } from '../utils/search.js';

test('escapeRegex neutralises regex metacharacters', () => {
  assert.equal(escapeRegex('a.b*c(d)'), String.raw`a\.b\*c\(d\)`);
  assert.ok(new RegExp(escapeRegex('1+1=2')).test('1+1=2'));
});

test('buildSearchFilter builds keyword and user filters', () => {
  const { filter } = buildSearchFilter({ room: ' general ', q: 'hello.', user: 'Alex' });
  assert.equal(filter.room, 'general');
  assert.equal(filter.text.$regex, String.raw`hello\.`);
  assert.equal(filter.text.$options, 'i');
  assert.equal(filter.sender.$regex, '^Alex$');
});

test('buildSearchFilter supports keyword-only and user-only searches', () => {
  assert.equal(buildSearchFilter({ room: 'r', q: 'hi' }).filter.sender, undefined);
  assert.equal(buildSearchFilter({ room: 'r', user: 'Bob' }).filter.text, undefined);
});

test('buildSearchFilter requires a room and something to search for', () => {
  assert.ok(buildSearchFilter({ q: 'hi' }).error);
  assert.ok(buildSearchFilter({ room: 'r' }).error);
  assert.ok(buildSearchFilter({ room: 'r', q: '   ', user: ' ' }).error);
});

test('buildSearchFilter rejects non-string, over-long and bad cursor input', () => {
  assert.ok(buildSearchFilter({ room: ['a', 'b'], q: 'hi' }).error);
  assert.ok(buildSearchFilter({ room: 'r', q: { $ne: '' } }).error);
  assert.ok(buildSearchFilter({ room: 'r', q: 'x'.repeat(101) }).error);
  assert.ok(buildSearchFilter({ room: 'r', q: 'hi', before: 'not-a-date' }).error);
  assert.ok(buildSearchFilter({ room: 'r', q: 'hi', before: ['2026-01-01'] }).error);
});

test('buildSearchFilter turns a valid cursor into a createdAt bound', () => {
  const { filter } = buildSearchFilter({ room: 'r', q: 'hi', before: '2026-10-11T12:00:00.000Z' });
  assert.equal(filter.createdAt.$lt.toISOString(), '2026-10-11T12:00:00.000Z');
});
