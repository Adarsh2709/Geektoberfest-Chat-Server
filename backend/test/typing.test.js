import test from 'node:test';
import assert from 'node:assert/strict';
import { TYPING_MIN_INTERVAL_MS, parseTypingEvent, shouldRelayTyping } from '../utils/typing.js';

const valid = { room: ' general ', sender: ' Alex ', senderId: 'abc-123', typing: true };

test('parseTypingEvent trims and returns a clean event', () => {
  assert.deepEqual(parseTypingEvent(valid), {
    room: 'general',
    sender: 'Alex',
    senderId: 'abc-123',
    socketId: '',
    typing: true,
  });
  assert.equal(parseTypingEvent({ ...valid, socketId: 'sock-1' }).socketId, 'sock-1');
  assert.equal(parseTypingEvent({ ...valid, socketId: 42 }).socketId, '');
  assert.equal(parseTypingEvent({ ...valid, typing: false }).typing, false);
});

test('parseTypingEvent truncates over-long fields', () => {
  const event = parseTypingEvent({ room: 'r'.repeat(50), sender: 's'.repeat(50), senderId: 'i'.repeat(100), typing: true });
  assert.equal(event.room.length, 32);
  assert.equal(event.sender.length, 24);
  assert.equal(event.senderId.length, 64);
});

test('parseTypingEvent rejects non-objects', () => {
  for (const bad of [null, undefined, 'typing', 7, true, [], [valid]]) {
    assert.equal(parseTypingEvent(bad), null);
  }
});

test('parseTypingEvent requires a boolean typing flag', () => {
  for (const typing of [undefined, null, 'true', 1, 0, {}]) {
    assert.equal(parseTypingEvent({ ...valid, typing }), null);
  }
});

test('parseTypingEvent requires room, sender and senderId text', () => {
  for (const field of ['room', 'sender', 'senderId']) {
    assert.equal(parseTypingEvent({ ...valid, [field]: undefined }), null);
    assert.equal(parseTypingEvent({ ...valid, [field]: 42 }), null);
    assert.equal(parseTypingEvent({ ...valid, [field]: '' }), null);
  }
  assert.equal(parseTypingEvent({ ...valid, room: '   ' }), null);
  assert.equal(parseTypingEvent({ ...valid, sender: '   ' }), null);
});

test('shouldRelayTyping throttles rapid events and allows them after the interval', () => {
  assert.equal(shouldRelayTyping(undefined, 5000), true);
  assert.equal(shouldRelayTyping(0, 5000), true);
  assert.equal(shouldRelayTyping(5000, 5000 + TYPING_MIN_INTERVAL_MS - 1), false);
  assert.equal(shouldRelayTyping(5000, 5000 + TYPING_MIN_INTERVAL_MS), true);
});
