// Who may join a private room. Owners and moderators always may; everyone else needs an invite.
// Rooms that are not private are open to anyone, as before.
export function canJoinRoom({ isPrivate, invitedIds = [] }, userId, room) {
  if (!isPrivate) return true;
  if (!userId) return false;
  if (room?.ownerId === userId) return true;
  if (room?.moderators?.includes(userId)) return true;
  return invitedIds.includes(userId);
}

// Only the owner can make a room private or public.
export function canChangePrivacy(room, userId) {
  return Boolean(userId) && room?.ownerId === userId;
}

// Owners and moderators can invite or uninvite people to a private room.
export function canManageInvites(room, userId) {
  return Boolean(userId) && (room?.ownerId === userId || Boolean(room?.moderators?.includes(userId)));
}
