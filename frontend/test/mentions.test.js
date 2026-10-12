import test from 'node:test';
import assert from 'node:assert/strict';
import { extractMentions, normalizeName } from '../src/lib/mentions.js';

test('extractMentions finds lowercased, de-duplicated mentions', () => {
  assert.deepEqual(extractMentions('hi @Alex and @bob, meet @ALEX'), ['alex', 'bob']);
});

test('extractMentions ignores emails, bare @ and trailing punctuation', () => {
  assert.deepEqual(extractMentions('mail me at a@b.com'), []);
  assert.deepEqual(extractMentions('@ alone'), []);
  assert.deepEqual(extractMentions('thanks @alex.'), ['alex']);
  assert.deepEqual(extractMentions('(@alex)'), ['alex']);
});

test('extractMentions handles non-strings and caps the number of mentions', () => {
  assert.deepEqual(extractMentions(undefined), []);
  const many = Array.from({ length: 30 }, (_, i) => `@user${i}`).join(' ');
  assert.equal(extractMentions(many).length, 10);
});

test('normalizeName strips spaces and case', () => {
  assert.equal(normalizeName(' Harshavi  Tank '), 'harshavitank');
  assert.equal(normalizeName(undefined), '');
});

test('a display name with spaces is mentioned without them', () => {
  assert.ok(extractMentions('ping @HarshaviTank please').includes(normalizeName('Harshavi Tank')));
});
