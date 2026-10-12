import crypto from 'node:crypto';
import { promisify } from 'node:util';
import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from './models/user.js';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;
const TOKEN_TTL = '7d';
const USERNAME_PATTERN = /^[a-z0-9_-]{3,24}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

// Login hashes against this when the username doesn't exist, so response
// timing doesn't reveal which usernames are registered.
const dummyHash = hashPassword(crypto.randomUUID());

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add a long random string to backend/.env.');
  }
  return secret;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, keyHex] = storedHash.split(':');
  const key = await scrypt(password, salt, KEY_LENGTH);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

function issueToken(user) {
  return jwt.sign({ ver: user.tokenVersion }, getJwtSecret(), {
    subject: user.id,
    expiresIn: TOKEN_TTL,
  });
}

async function userFromToken(token) {
  if (typeof token !== 'string' || !token) return null;

  let payload;
  try {
    payload = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
  } catch {
    return null;
  }

  const user = await User.findById(payload.sub);
  return user && user.tokenVersion === payload.ver ? user : null;
}

function publicUser(user) {
  return { id: user.id, username: user.username };
}

function readCredentials(body) {
  return {
    username: typeof body?.username === 'string' ? body.username.trim().toLowerCase() : '',
    password: typeof body?.password === 'string' ? body.password : '',
  };
}

async function requireAuth(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  const user = scheme === 'Bearer' ? await userFromToken(token) : null;
  if (!user) return res.status(401).json({ error: 'Please log in again.' });

  req.user = user;
  next();
}

export const authRouter = express.Router();
authRouter.use(express.json({ limit: '10kb' }));

authRouter.post('/register', async (req, res) => {
  const { username, password } = readCredentials(req.body);
  if (!USERNAME_PATTERN.test(username)) {
    return res.status(400).json({ error: 'Usernames must be 3-24 letters, numbers, underscores, or hyphens.' });
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return res.status(400).json({ error: `Passwords must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.` });
  }

  try {
    const user = await User.create({ username, passwordHash: await hashPassword(password) });
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'That username is already taken.' });
    throw error;
  }
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = readCredentials(req.body);
  const user = password.length <= PASSWORD_MAX ? await User.findOne({ username }) : null;
  const valid = await verifyPassword(password, user?.passwordHash ?? await dummyHash);
  if (!user || !valid) return res.status(401).json({ error: 'Incorrect username or password.' });

  res.json({ token: issueToken(user), user: publicUser(user) });
});

authRouter.post('/logout', requireAuth, async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  req.app.get('io')?.in(`user:${req.user.id}`).disconnectSockets(true);
  res.status(204).end();
});

authRouter.use((error, _req, res, _next) => {
  const status = error.status || 500;
  if (status >= 500) console.error(`Auth request failed: ${error.message}`);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong. Try again.' : 'Invalid request.' });
});

export async function authenticateSocket(socket, next) {
  try {
    const user = await userFromToken(socket.handshake.auth?.token);
    if (!user) return next(new Error('Unauthorized'));

    socket.data.user = publicUser(user);
    next();
  } catch (error) {
    console.error(`Socket authentication failed: ${error.message}`);
    next(new Error('Authentication unavailable'));
  }
}
