import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'poker_with_friends_super_secret_key_2026';

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function verifySocketToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export async function login(username, password) {
  const cleanUsername = (username || '').trim().toLowerCase();
  if (!cleanUsername || !password) {
    throw new Error('Username and password are required');
  }

  const res = await query(
    'SELECT * FROM poker_with_friends_users WHERE LOWER(username) = $1',
    [cleanUsername]
  );

  if (res.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = res.rows[0];
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    throw new Error('Incorrect password');
  }

  const token = generateToken(user);
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      avatarColor: user.avatar_color,
      handsPlayed: user.hands_played,
      handsWon: user.hands_won,
      netProfit: user.net_profit,
    },
  };
}

export async function register(username, password) {
  const cleanUsername = (username || '').trim().toLowerCase();
  if (!cleanUsername || cleanUsername.length < 2) {
    throw new Error('Username must be at least 2 characters');
  }
  if (!password || password.length < 3) {
    throw new Error('Password must be at least 3 characters');
  }

  const check = await query(
    'SELECT id FROM poker_with_friends_users WHERE LOWER(username) = $1',
    [cleanUsername]
  );
  if (check.rows.length > 0) {
    throw new Error('Username already taken');
  }

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];
  const randomColor = colors[Math.floor(Math.random() * colors.length)];
  const passwordHash = await bcrypt.hash(password, 10);

  const insertRes = await query(
    `INSERT INTO poker_with_friends_users (username, password_hash, avatar_color)
     VALUES ($1, $2, $3)
     RETURNING id, username, avatar_color, hands_played, hands_won, net_profit`,
    [cleanUsername, passwordHash, randomColor]
  );

  const newUser = insertRes.rows[0];
  const token = generateToken(newUser);

  return {
    token,
    user: {
      id: newUser.id,
      username: newUser.username,
      avatarColor: newUser.avatar_color,
      handsPlayed: newUser.hands_played,
      handsWon: newUser.hands_won,
      netProfit: newUser.net_profit,
    },
  };
}

export async function getUserProfile(userId) {
  const res = await query(
    `SELECT id, username, avatar_color, hands_played, hands_won, net_profit, created_at
     FROM poker_with_friends_users
     WHERE id = $1`,
    [userId]
  );
  if (res.rows.length === 0) return null;
  const u = res.rows[0];
  return {
    id: u.id,
    username: u.username,
    avatarColor: u.avatar_color,
    handsPlayed: u.hands_played,
    handsWon: u.hands_won,
    netProfit: u.net_profit,
    createdAt: u.created_at,
  };
}

