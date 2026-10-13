import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangePrivacy, canJoinRoom, canManageInvites } from '../utils/privateRooms.js';

const room = { ownerId: 'owner', moderators: ['mod'] };

test('anyone can join a room that is not private', () => {
  assert.equal(canJoinRoom({ isPrivate: false }, 'stranger', room), true);
  assert.equal(canJoinRoom({ isPrivate: false }, '', room), true);
});

test('a private room lets in the owner, moderators and invited users only', () => {
  const access = { isPrivate: true, invitedIds: ['friend'] };
  assert.equal(canJoinRoom(access, 'owner', room), true);
  assert.equal(canJoinRoom(access, 'mod', room), true);
  assert.equal(canJoinRoom(access, 'friend', room), true);
  assert.equal(canJoinRoom(access, 'stranger', room), false);
});

test('an anonymous socket cannot join a private room', () => {
  assert.equal(canJoinRoom({ isPrivate: true, invitedIds: [''] }, '', room), false);
});

test('only the owner can change privacy', () => {
  assert.equal(canChangePrivacy(room, 'owner'), true);
  assert.equal(canChangePrivacy(room, 'mod'), false);
  assert.equal(canChangePrivacy(room, ''), false);
});

test('owners and moderators can manage invites, members cannot', () => {
  assert.equal(canManageInvites(room, 'owner'), true);
  assert.equal(canManageInvites(room, 'mod'), true);
  assert.equal(canManageInvites(room, 'stranger'), false);
  assert.equal(canManageInvites(room, ''), false);
});
