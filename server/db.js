import pg from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const DEFAULT_DB_URL =
  'postgresql://real_estate_db_osz6_user:0kFF0DPxXD9fJ9q5DNJySdmUBtkWHvBS@dpg-d02b4hje5dus73bjo250-a.frankfurt-postgres.render.com/real_estate_db_osz6';

const connectionString = process.env.DATABASE_URL || DEFAULT_DB_URL;

export const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function initDb() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Users table: poker_with_friends_users
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_with_friends_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(64) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_color VARCHAR(32) NOT NULL DEFAULT '#10b981',
        hands_played INTEGER NOT NULL DEFAULT 0,
        hands_won INTEGER NOT NULL DEFAULT 0,
        net_profit INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Games table: poker_with_friends_games
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_with_friends_games (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        created_by INTEGER REFERENCES poker_with_friends_users(id) ON DELETE SET NULL,
        small_blind INTEGER NOT NULL DEFAULT 1,
        big_blind INTEGER NOT NULL DEFAULT 2,
        max_players INTEGER NOT NULL DEFAULT 8,
        status VARCHAR(32) NOT NULL DEFAULT 'waiting',
        is_paused BOOLEAN NOT NULL DEFAULT FALSE,
        dealer_seat INTEGER NOT NULL DEFAULT 0,
        hand_number INTEGER NOT NULL DEFAULT 0,
        game_state JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Game Players table: poker_with_friends_game_players
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_with_friends_game_players (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES poker_with_friends_games(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES poker_with_friends_users(id) ON DELETE CASCADE,
        seat_index INTEGER NOT NULL,
        chips INTEGER NOT NULL DEFAULT 0,
        total_buy_in INTEGER NOT NULL DEFAULT 0,
        is_sitting_out BOOLEAN NOT NULL DEFAULT FALSE,
        is_at_table BOOLEAN NOT NULL DEFAULT TRUE,
        pending_top_up INTEGER NOT NULL DEFAULT 0,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, user_id),
        UNIQUE(game_id, seat_index)
      );
    `);

    // 4. Hand History table: poker_with_friends_hand_history
    await client.query(`
      CREATE TABLE IF NOT EXISTS poker_with_friends_hand_history (
        id SERIAL PRIMARY KEY,
        game_id INTEGER NOT NULL REFERENCES poker_with_friends_games(id) ON DELETE CASCADE,
        hand_number INTEGER NOT NULL,
        pot_total INTEGER NOT NULL DEFAULT 0,
        community_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
        winners JSONB NOT NULL DEFAULT '[]'::jsonb,
        actions_log JSONB NOT NULL DEFAULT '[]'::jsonb,
        players_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed the 3 required initial profiles: "arthur", "matteo", "cyprien" with password "1234"
    const seedUsers = [
      { username: 'arthur', color: '#10b981' },  // Emerald
      { username: 'matteo', color: '#3b82f6' },  // Royal Blue
      { username: 'cyprien', color: '#f59e0b' }, // Amber Gold
    ];

    const defaultPasswordHash = await bcrypt.hash('1234', 10);

    for (const u of seedUsers) {
      await client.query(
        `
        INSERT INTO poker_with_friends_users (username, password_hash, avatar_color)
        VALUES ($1, $2, $3)
        ON CONFLICT (username) DO NOTHING
        `,
        [u.username, defaultPasswordHash, u.color]
      );
    }

    // Create a default cash game if none exist yet
    const gamesCountRes = await client.query('SELECT COUNT(*) FROM poker_with_friends_games');
    if (parseInt(gamesCountRes.rows[0].count, 10) === 0) {
      const arthurRes = await client.query(
        'SELECT id FROM poker_with_friends_users WHERE username = $1',
        ['arthur']
      );
      const creatorId = arthurRes.rows[0]?.id || null;

      await client.query(
        `
        INSERT INTO poker_with_friends_games (name, created_by, small_blind, big_blind, max_players, status, is_paused, game_state)
        VALUES ($1, $2, $3, $4, $5, 'waiting', false, $6)
        `,
        [
          "Arthur's High Rollers (100 BB)",
          creatorId,
          1,
          2,
          8,
          JSON.stringify({
            phase: 'waiting',
            communityCards: [],
            pot: 0,
            sidePots: [],
            currentTurnSeat: null,
            dealerSeat: 0,
            smallBlindSeat: null,
            bigBlindSeat: null,
            currentBet: 0,
            minRaise: 2,
            lastActionText: 'Waiting for players to take a seat...',
            actionLog: [],
          }),
        ]
      );
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully with poker_with_friends_* tables and seed profiles.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database:', err);
    throw err;
  } finally {
    client.release();
  }
}

