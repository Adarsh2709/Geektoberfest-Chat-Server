// Roles are per room: the first identified user to join becomes the owner, and
// the owner can promote other users to moderator.
export function getRole(room, userId) {
  if (!room || !userId) return 'member';
  if (room.ownerId === userId) return 'owner';
  if (room.moderators.includes(userId)) return 'moderator';
  return 'member';
}

// Owners can act on anyone else; moderators can only act on regular members.
export function canModerate(room, actorId, targetId = '') {
  if (!actorId || actorId === targetId) return false;
  const actor = getRole(room, actorId);
  if (actor === 'owner') return true;
  return actor === 'moderator' && getRole(room, targetId) === 'member';
}

export function canManageModerators(room, actorId) {
  return getRole(room, actorId) === 'owner';
}

export function isStaff(room, userId) {
  return getRole(room, userId) !== 'member';
}
