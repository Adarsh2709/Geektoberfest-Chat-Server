import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../utils/rateLimiter.js';
import { validateMessage, validateRoom } from '../utils/validation.js';

test('rate limiter allows up to max then blocks until the window resets', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter.consume('a', 0).allowed, true);
  assert.equal(limiter.consume('a', 10).allowed, true);

  const blocked = limiter.consume('a', 20);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterMs, 980);

  assert.equal(limiter.consume('a', 1000).allowed, true);
  limiter.stop();
});

test('rate limiter tracks keys independently and can reset a key', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.consume('a', 0).allowed, true);
  assert.equal(limiter.consume('a', 1).allowed, false);
  assert.equal(limiter.consume('b', 1).allowed, true);

  limiter.reset('a');
  assert.equal(limiter.consume('a', 2).allowed, true);
  limiter.stop();
});

test('rate limiter prune drops expired windows', () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.consume('a', 0);
  limiter.prune(2000);
  assert.equal(limiter.consume('a', 2001).allowed, true);
  limiter.stop();
});

test('validateRoom trims and rejects empty, non-string, long and control-char names', () => {
  assert.deepEqual(validateRoom('  general '), { ok: true, value: 'general' });
  assert.equal(validateRoom('').ok, false);
  assert.equal(validateRoom('   ').ok, false);
  assert.equal(validateRoom(42).ok, false);
  assert.equal(validateRoom({}).ok, false);
  assert.equal(validateRoom('x'.repeat(33)).ok, false);
  assert.equal(validateRoom('x'.repeat(32)).ok, true);
  assert.equal(validateRoom('bad\u0000room').ok, false);
});

test('validateMessage accepts a well-formed message', () => {
  const result = validateMessage({
    room: ' general ',
    sender: ' Alex ',
    senderId: '3f2a9c1e-5b7d-4e1a-9c2b-0d4e6f8a1b3c',
    text: ' hi\nthere ',
  });
  assert.deepEqual(result, {
    ok: true,
    value: { room: 'general', sender: 'Alex', senderId: '3f2a9c1e-5b7d-4e1a-9c2b-0d4e6f8a1b3c', text: 'hi\nthere' },
  });
});

test('validateMessage allows a missing senderId (e.g. the CLI client)', () => {
  const result = validateMessage({ room: 'general', sender: 'cli', text: 'hello' });
  assert.equal(result.ok, true);
  assert.equal(result.value.senderId, '');
});

test('validateMessage rejects non-objects and wrong field types', () => {
  for (const bad of [null, undefined, 'text', 5, [], ['a']]) {
    assert.equal(validateMessage(bad).ok, false);
  }
  const base = { room: 'general', sender: 'Alex', text: 'hi' };
  assert.equal(validateMessage({ ...base, text: 123 }).ok, false);
  assert.equal(validateMessage({ ...base, sender: { name: 'x' } }).ok, false);
  assert.equal(validateMessage({ ...base, room: ['general'] }).ok, false);
});

test('validateMessage rejects over-length fields instead of truncating', () => {
  const base = { room: 'general', sender: 'Alex', text: 'hi' };
  assert.equal(validateMessage({ ...base, text: 'x'.repeat(1001) }).ok, false);
  assert.equal(validateMessage({ ...base, text: 'x'.repeat(1000) }).ok, true);
  assert.equal(validateMessage({ ...base, sender: 'x'.repeat(25) }).ok, false);
  assert.equal(validateMessage({ ...base, senderId: 'x'.repeat(65) }).ok, false);
});

test('validateMessage rejects blank text and control characters', () => {
  const base = { room: 'general', sender: 'Alex', text: 'hi' };
  assert.equal(validateMessage({ ...base, text: '   ' }).ok, false);
  assert.equal(validateMessage({ ...base, text: 'bad\u0007text' }).ok, false);
  assert.equal(validateMessage({ ...base, sender: 'Al\u0000ex' }).ok, false);
});

test('validateMessage rejects malformed senderId values', () => {
  const base = { room: 'general', sender: 'Alex', text: 'hi' };
  assert.equal(validateMessage({ ...base, senderId: 'has spaces' }).ok, false);
  assert.equal(validateMessage({ ...base, senderId: '<script>' }).ok, false);
  assert.equal(validateMessage({ ...base, senderId: 123 }).ok, false);
});
