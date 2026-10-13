const { request, register, connect, uniqueName, PASSWORD } = require('./helpers/client.cjs');

describe('health', () => {
  test('reports OK when MongoDB and Redis are connected', async () => {
    const { status, body } = await request('GET', '/health');
    expect(status).toBe(200);
    expect(body).toEqual({ status: 'OK' });
  });
});

describe('auth', () => {
  test('registers a user and returns a token', async () => {
    const user = await register('reg');
    expect(user.token).toEqual(expect.any(String));
    expect(user.id).toEqual(expect.any(String));
  });

  test('rejects a duplicate username with 409', async () => {
    const user = await register('dup');
    const { status } = await request('POST', '/api/auth/register', { body: { username: user.username, password: PASSWORD } });
    expect(status).toBe(409);
  });

  test('rejects an invalid username and a short password with 400', async () => {
    const badName = await request('POST', '/api/auth/register', { body: { username: 'a!', password: PASSWORD } });
    const badPassword = await request('POST', '/api/auth/register', { body: { username: uniqueName('pw'), password: 'short' } });
    expect(badName.status).toBe(400);
    expect(badPassword.status).toBe(400);
  });

  test('logs in with the right password and rejects the wrong one', async () => {
    const user = await register('login');
    const ok = await request('POST', '/api/auth/login', { body: { username: user.username, password: PASSWORD } });
    const bad = await request('POST', '/api/auth/login', { body: { username: user.username, password: 'wrong-password-here' } });
    expect(ok.status).toBe(200);
    expect(ok.body.user.username).toBe(user.username);
    expect(bad.status).toBe(401);
  });

  test('logout revokes the token for HTTP and for new sockets', async () => {
    const user = await register('out');
    const live = await connect(user.token);
    const dropped = new Promise((resolve) => live.socket.once('disconnect', resolve));

    expect((await request('POST', '/api/auth/logout', { token: user.token })).status).toBe(204);
    await dropped;
    expect((await request('POST', '/api/auth/logout', { token: user.token })).status).toBe(401);
    await expect(connect(user.token)).rejects.toThrow('Unauthorized');
  });

  test('a socket without a valid token is refused', async () => {
    await expect(connect('not-a-real-token')).rejects.toThrow('Unauthorized');
    await expect(connect(undefined)).rejects.toThrow('Unauthorized');
  });
});
