import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageModerators, canModerate, getRole, isStaff } from '../utils/permissions.js';

const room = { ownerId: 'owner', moderators: ['mod1', 'mod2'] };

test('getRole resolves owner, moderator and member', () => {
  assert.equal(getRole(room, 'owner'), 'owner');
  assert.equal(getRole(room, 'mod1'), 'moderator');
  assert.equal(getRole(room, 'someone'), 'member');
  assert.equal(getRole(room, ''), 'member');
  assert.equal(getRole(null, 'owner'), 'member');
});

test('owner can moderate everyone except themselves', () => {
  assert.equal(canModerate(room, 'owner', 'mod1'), true);
  assert.equal(canModerate(room, 'owner', 'someone'), true);
  assert.equal(canModerate(room, 'owner', 'owner'), false);
});

test('moderators can only moderate regular members', () => {
  assert.equal(canModerate(room, 'mod1', 'someone'), true);
  assert.equal(canModerate(room, 'mod1', 'mod2'), false);
  assert.equal(canModerate(room, 'mod1', 'owner'), false);
  assert.equal(canModerate(room, 'mod1', 'mod1'), false);
});

test('members and anonymous users cannot moderate', () => {
  assert.equal(canModerate(room, 'someone', 'other'), false);
  assert.equal(canModerate(room, '', 'other'), false);
});

test('moderating a message with no author id is allowed for staff only', () => {
  assert.equal(canModerate(room, 'mod1', ''), true);
  assert.equal(canModerate(room, 'someone', ''), false);
});

test('only the owner can manage moderators', () => {
  assert.equal(canManageModerators(room, 'owner'), true);
  assert.equal(canManageModerators(room, 'mod1'), false);
  assert.equal(canManageModerators(room, 'someone'), false);
});

test('isStaff is true for owner and moderators', () => {
  assert.equal(isStaff(room, 'owner'), true);
  assert.equal(isStaff(room, 'mod2'), true);
  assert.equal(isStaff(room, 'someone'), false);
});
