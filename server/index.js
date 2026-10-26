import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import { initDb, query } from './db.js';
import { login, register, getUserProfile, authMiddleware, verifySocketToken } from './auth.js';
import {
  getTable,
  serializeTableForUser,
  joinTableSeat,
  topUpPlayerChips,
  standUpFromTable,
  toggleSitOut,
  setGamePaused,
  updateGameSettings,
  startNewHand,
  handlePlayerAction,
  revealPlayerCards,
  getCapInChips,
  createInitialGameState,
  persistTableToDb,
} from './pokerEngine.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Broadcast table state to all connected sockets viewing the game
export async function broadcastTableState(table) {
  const roomName = `game:${table.id}`;
  const socketsInRoom = await io.in(roomName).fetchSockets();

  for (const s of socketsInRoom) {
    const userId = s.data.userId || null;
    const userView = serializeTableForUser(table, userId);
    s.emit('table_update', userView);
  }

  // Also broadcast lobby update
  io.emit('lobby_update', { gameId: table.id });
}

// ----------------- REST API -----------------

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await login(username, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await register(username, password);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const profile = await getUserProfile(req.user.id);
    if (!profile) return res.status(404).json({ error: 'User not found' });
    res.json({ user: profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leaderboard / Player list
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await query(
      `SELECT id, username, avatar_color, hands_played, hands_won, net_profit, created_at
       FROM poker_with_friends_users
       ORDER BY net_profit DESC, hands_won DESC
       LIMIT 50`
    );
    res.json({ players: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List games
app.get('/api/games', async (req, res) => {
  try {
    const result = await query(
      `SELECT g.*, u.username AS creator_username,
              COUNT(gp.id) AS seated_players_count
       FROM poker_with_friends_games g
       LEFT JOIN poker_with_friends_users u ON g.created_by = u.id
       LEFT JOIN poker_with_friends_game_players gp ON g.id = gp.game_id
       GROUP BY g.id, u.username
       ORDER BY g.updated_at DESC, g.id DESC`
    );

    const games = result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdBy: r.created_by,
      creatorUsername: r.creator_username || 'Host',
      smallBlind: Number(r.small_blind),
      bigBlind: Number(r.big_blind),
      maxBuyIn: getCapInChips(r.big_blind),
      maxPlayers: Number(r.max_players),
      status: r.status,
      isPaused: Boolean(r.is_paused),
      seatedPlayersCount: Number(r.seated_players_count || 0),
      handNumber: Number(r.hand_number || 0),
      updatedAt: r.updated_at,
    }));

    res.json({ games });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create cash game
app.post('/api/games', authMiddleware, async (req, res) => {
  try {
    const { name, smallBlind = 1, bigBlind = 2, maxPlayers = 8 } = req.body;
    const cleanName = (name || '').trim() || `${req.user.username}'s Cash Game`;
    const sb = Math.max(1, parseInt(smallBlind, 10) || 1);
    const bb = Math.max(sb, parseInt(bigBlind, 10) || sb * 2);
    const maxP = Math.min(9, Math.max(2, parseInt(maxPlayers, 10) || 8));

    const initState = createInitialGameState(bb);

    const insertRes = await query(
      `INSERT INTO poker_with_friends_games
        (name, created_by, small_blind, big_blind, max_players, status, is_paused, game_state)
       VALUES ($1, $2, $3, $4, $5, 'waiting', false, $6)
       RETURNING id`,
      [cleanName, req.user.id, sb, bb, maxP, JSON.stringify(initState)]
    );

    const newGameId = insertRes.rows[0].id;
    io.emit('lobby_update', { gameId: newGameId });
    res.status(201).json({ id: newGameId, message: 'Game created successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get single game details
app.get('/api/games/:id', async (req, res) => {
  try {
    const table = await getTable(req.params.id);
    if (!table) return res.status(404).json({ error: 'Game not found' });
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const decoded = verifySocketToken(authHeader.split(' ')[1]);
      if (decoded) userId = decoded.id;
    }
    res.json({ table: serializeTableForUser(table, userId) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit game settings / pause / resume
app.patch('/api/games/:id', authMiddleware, async (req, res) => {
  try {
    const table = await updateGameSettings(req.params.id, req.body, req.user.username);
    await broadcastTableState(table);
    res.json({ table: serializeTableForUser(table, req.user.id) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Hand history for a game
app.get('/api/games/:id/history', async (req, res) => {
  try {
    const historyRes = await query(
      `SELECT id, hand_number, pot_total, community_cards, winners, actions_log, players_snapshot, created_at
       FROM poker_with_friends_hand_history
       WHERE game_id = $1
       ORDER BY hand_number DESC
       LIMIT 30`,
      [req.params.id]
    );
    res.json({ history: historyRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------- Socket.IO Events -----------------
io.on('connection', (socket) => {
  // Authentication via socket handshake or auth message
  socket.on('auth', (token) => {
    const decoded = verifySocketToken(token);
    if (decoded) {
      socket.data.userId = decoded.id;
      socket.data.username = decoded.username;
    }
  });

  socket.on('join_game_room', async ({ gameId, token }) => {
    if (token) {
      const decoded = verifySocketToken(token);
      if (decoded) {
        socket.data.userId = decoded.id;
        socket.data.username = decoded.username;
      }
    }
    const roomName = `game:${gameId}`;
    socket.join(roomName);

    try {
      const table = await getTable(gameId);
      if (table) {
        socket.emit('table_update', serializeTableForUser(table, socket.data.userId));
      }
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  socket.on('leave_game_room', ({ gameId }) => {
    socket.leave(`game:${gameId}`);
  });

  // Join a seat with 100BB buy-in
  socket.on('join_seat', async ({ gameId, seatIndex, buyIn, token }) => {
    try {
      let userId = socket.data.userId;
      let username = socket.data.username;
      if (token) {
        const decoded = verifySocketToken(token);
        if (decoded) {
          userId = decoded.id;
          username = decoded.username;
          socket.data.userId = userId;
          socket.data.username = username;
        }
      }
      if (!userId) {
        return socket.emit('error_message', 'You must be logged in to take a seat.');
      }

      const userProfile = await getUserProfile(userId);
      const table = await joinTableSeat(gameId, userProfile, seatIndex, buyIn);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Stand up / leave seat and cash out
  socket.on('stand_up', async ({ gameId }) => {
    try {
      if (!socket.data.userId) return socket.emit('error_message', 'Not logged in');
      const table = await standUpFromTable(gameId, socket.data.userId, broadcastTableState);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Toggle sitting out
  socket.on('toggle_sit_out', async ({ gameId }) => {
    try {
      if (!socket.data.userId) return socket.emit('error_message', 'Not logged in');
      const table = await toggleSitOut(gameId, socket.data.userId);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Top up chips capped at 100BB
  socket.on('top_up', async ({ gameId, amount }) => {
    try {
      if (!socket.data.userId) return socket.emit('error_message', 'Not logged in');
      const result = await topUpPlayerChips(gameId, socket.data.userId, amount);
      await broadcastTableState(result.table);
      socket.emit('info_message', result.message);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Player action: fold, check, call, raise
  socket.on('player_action', async ({ gameId, action }) => {
    try {
      if (!socket.data.userId) return socket.emit('error_message', 'Not logged in');
      const table = await handlePlayerAction(gameId, socket.data.userId, action, broadcastTableState);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Start new hand manually
  socket.on('start_hand', async ({ gameId }) => {
    try {
      const table = await getTable(gameId);
      if (!table) return socket.emit('error_message', 'Game not found');
      await startNewHand(table);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Pause / resume game
  socket.on('toggle_pause', async ({ gameId }) => {
    try {
      const table = await getTable(gameId);
      if (!table) return socket.emit('error_message', 'Game not found');
      const updated = await setGamePaused(
        gameId,
        !table.isPaused,
        socket.data.username || 'A player'
      );
      await broadcastTableState(updated);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Show hole cards
  socket.on('show_cards', async ({ gameId }) => {
    try {
      if (!socket.data.userId) return socket.emit('error_message', 'Not logged in');
      const table = await revealPlayerCards(gameId, socket.data.userId);
      await broadcastTableState(table);
    } catch (err) {
      socket.emit('error_message', err.message);
    }
  });

  // Chat message
  socket.on('chat_message', ({ gameId, message }) => {
    const text = (message || '').trim();
    if (!text) return;
    io.in(`game:${gameId}`).emit('new_chat', {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      username: socket.data.username || 'Guest',
      message: text.slice(0, 200),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  });
});

// Serve frontend build in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Fallback to index.html for client-side routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    console.log('Connecting to database and verifying schema...');
    await initDb();
    server.listen(PORT, () => {
      console.log(`♠️ ♥️ ♦️ ♣️ Poker With Friends server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Fatal server startup error:', err);
    process.exit(1);
  }
}

startServer();

