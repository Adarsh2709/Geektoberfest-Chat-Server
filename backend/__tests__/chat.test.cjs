const { register, joinRoom, uniqueName, pause } = require('./helpers/client.cjs');

const newRoom = () => uniqueName('room');
const say = (client, room, text, clientId) => client.emitWithAck('send_message', { room, text, clientId });

describe('messaging', () => {
  test('a message is acknowledged, broadcast to the room and stored with the account as sender', async () => {
    const [alice, bob] = [await register('al'), await register('bo')];
    const room = newRoom();
    const [a, b] = [await joinRoom(alice, room), await joinRoom(bob, room)];

    const ack = await say(a, room, 'hello there', 'c-1');
    expect(ack.ok).toBe(true);

    const received = await b.waitFor('receive_message');
    expect(received).toMatchObject({ sender: alice.username, senderId: alice.id, text: 'hello there', clientId: 'c-1' });
    a.close(); b.close();
  });

  test('the sender cannot be spoofed from the payload', async () => {
    const [alice, bob] = [await register('al'), await register('bo')];
    const room = newRoom();
    const [a, b] = [await joinRoom(alice, room), await joinRoom(bob, room)];

    await a.emitWithAck('send_message', { room, text: 'spoof', sender: 'someone', senderId: bob.id });
    const received = await b.waitFor('receive_message');
    expect(received.sender).toBe(alice.username);
    expect(received.senderId).toBe(alice.id);
    a.close(); b.close();
  });

  test('resending the same clientId is acknowledged but stored and broadcast once', async () => {
    const [alice, bob] = [await register('al'), await register('bo')];
    const room = newRoom();
    const [a, b] = [await joinRoom(alice, room), await joinRoom(bob, room)];

    expect((await say(a, room, 'once', 'dup-1')).ok).toBe(true);
    expect((await say(a, room, 'once', 'dup-1')).duplicate).toBe(true);
    await pause(300);
    expect(b.of('receive_message')).toHaveLength(1);

    const late = await joinRoom(await register('la'), room);
    expect(late.last('chat_history')).toHaveLength(1);
    a.close(); b.close(); late.close();
  });

  test('messages stay inside their room', async () => {
    const [alice, bob] = [await register('al'), await register('bo')];
    const roomA = newRoom();
    const [a, b] = [await joinRoom(alice, roomA), await joinRoom(bob, newRoom())];

    await say(a, roomA, 'only for room A', 'iso-1');
    await pause(300);
    expect(b.of('receive_message')).toHaveLength(0);
    a.close(); b.close();
  });

  test('history returns the stored messages, oldest first', async () => {
    const [alice, bob] = [await register('al'), await register('bo')];
    const room = newRoom();
    const a = await joinRoom(alice, room);
    for (const text of ['one', 'two', 'three']) await say(a, room, text, `h-${text}`);

    const b = await joinRoom(bob, room);
    expect(b.last('chat_history').map((message) => message.text)).toEqual(['one', 'two', 'three']);
    a.close(); b.close();
  });

  test('a message with no text is rejected through the acknowledgement', async () => {
    const a = await joinRoom(await register('al'), newRoom());
    const ack = await a.emitWithAck('send_message', { room: 'r', text: '   ' });
    expect(ack.ok).toBe(false);
    a.close();
  });
});

describe('moderation', () => {
  async function setup() {
    const [owner, member, other] = [await register('own'), await register('mem'), await register('oth')];
    const room = newRoom();
    const o = await joinRoom(owner, room); // the first user to join becomes the owner
    const m = await joinRoom(member, room);
    const t = await joinRoom(other, room);
    return { owner, member, other, room, o, m, t };
  }

  test('the first user in a room is the owner', async () => {
    const { owner, room, o, m } = await setup();
    expect((await m.waitFor('room_state')).ownerId).toBe(owner.id);
    expect(room).toBeTruthy();
    [o, m].forEach((client) => client.close());
  });

  test('a plain member cannot delete, mute or list reports', async () => {
    const { member, other, room, o, m, t } = await setup();
    await say(t, room, 'a message', 'm-1');
    const message = await m.waitFor('receive_message');

    m.socket.emit('delete_message', { room, messageId: message.id });
    m.socket.emit('mute_user', { room, targetId: other.id });
    m.socket.emit('list_reports', { room });
    await pause(400);
    expect(m.of('chat_error').length).toBe(3);
    expect(member.id).toBeTruthy();
    [o, m, t].forEach((client) => client.close());
  });

  test('the owner mutes and unmutes a member, and a muted member cannot send', async () => {
    const { member, room, o, m, t } = await setup();
    o.socket.emit('mute_user', { room, targetId: member.id });
    await m.waitFor('room_state', (state) => state.mutedIds.includes(member.id));

    const blocked = await say(m, room, 'muted talk', 'mu-1');
    expect(blocked.ok).toBe(false);

    m.events.length = 0; // only a state sent after the unmute counts
    o.socket.emit('unmute_user', { room, targetId: member.id });
    await m.waitFor('room_state', (state) => !state.mutedIds.includes(member.id));
    expect((await say(m, room, 'back again', 'mu-2')).ok).toBe(true);
    [o, m, t].forEach((client) => client.close());
  });

  test('the owner deletes a message, everyone is told and history hides the text', async () => {
    const { room, o, m, t } = await setup();
    await say(m, room, 'secret words', 'del-1');
    const message = await o.waitFor('receive_message');

    o.socket.emit('delete_message', { room, messageId: message.id });
    expect((await t.waitFor('message_deleted')).messageId).toBe(message.id);

    const late = await joinRoom(await register('la'), room);
    const stored = late.last('chat_history').find((item) => item.id === message.id);
    expect(stored).toMatchObject({ deleted: true, text: '' });
    [o, m, t, late].forEach((client) => client.close());
  });

  test('a moderator can act on members but not on the owner or other moderators', async () => {
    const { owner, member, other, room, o, m, t } = await setup();
    o.socket.emit('set_moderator', { room, targetId: member.id, value: true });
    await m.waitFor('room_state', (state) => state.moderators.includes(member.id));

    m.socket.emit('mute_user', { room, targetId: owner.id });
    await m.waitFor('chat_error');
    m.socket.emit('mute_user', { room, targetId: other.id });
    await t.waitFor('room_state', (state) => state.mutedIds.includes(other.id));
    [o, m, t].forEach((client) => client.close());
  });

  test('removing a user kicks them and blocks them from rejoining', async () => {
    const { other, room, o, t } = await setup();
    o.socket.emit('remove_user', { room, targetId: other.id });
    await t.waitFor('removed_from_room');

    const again = await joinRoom(other, room).catch((error) => error);
    expect(again).toBeInstanceOf(Error);
    [o, t].forEach((client) => client.close());
  });

  test('a report reaches the owner, can only be filed once per user, and cannot target your own message', async () => {
    const { owner, member, room, o, m, t } = await setup();
    await say(t, room, 'rude message', 'rep-1');
    const message = await m.waitFor('receive_message');

    m.socket.emit('report_message', { room, messageId: message.id, reason: 'rude' });
    await m.waitFor('chat_notice');
    m.socket.emit('report_message', { room, messageId: message.id });
    await m.waitFor('chat_error', (error) => /already/.test(error));

    t.socket.emit('report_message', { room, messageId: message.id });
    await t.waitFor('chat_error', (error) => /own message/.test(error));

    o.socket.emit('list_reports', { room });
    const reports = await o.waitFor('reports');
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ reason: 'rude', text: 'rude message' });
    expect([owner.id, member.id]).toHaveLength(2);
    [o, m, t].forEach((client) => client.close());
  });
});
