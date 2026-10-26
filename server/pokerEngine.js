import { query, pool } from './db.js';
import { createShuffledDeck, evaluateHoldemHand } from './handEvaluator.js';

/**
 * In-memory cache of active games synchronized with PostgreSQL `poker_with_friends_games`
 * and `poker_with_friends_game_players`.
 */
const activeTables = new Map();
const nextHandTimers = new Map();

export function getCapInChips(bigBlind) {
  return 100 * Number(bigBlind || 2);
}

/**
 * Default empty game state JSON
 */
export function createInitialGameState(bigBlind = 2) {
  return {
    phase: 'waiting', // 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown'
    deck: [],
    communityCards: [],
    pot: 0,
    sidePots: [],
    currentTurnSeat: null,
    dealerSeat: 0,
    smallBlindSeat: null,
    bigBlindSeat: null,
    currentBet: 0,
    minRaise: Number(bigBlind),
    lastActionText: 'Waiting for at least 2 players with chips to deal...',
    actionLog: [],
    playerStates: {}, // keyed by seatIndex: { holeCards, currentBet, totalHandBet, folded, allIn, actedThisRound, lastAction, revealedCards, handResult }
    winners: [],
    winningCards: [],
  };
}

/**
 * Loads a game and its players from PostgreSQL (or returns cached if already in memory, refreshing DB state)
 */
export async function loadTableFromDb(gameId) {
  const numGameId = Number(gameId);
  const gameRes = await query(
    `SELECT g.*, u.username AS creator_username
     FROM poker_with_friends_games g
     LEFT JOIN poker_with_friends_users u ON g.created_by = u.id
     WHERE g.id = $1`,
    [numGameId]
  );

  if (gameRes.rows.length === 0) {
    return null;
  }

  const gameRow = gameRes.rows[0];
  const playersRes = await query(
    `SELECT gp.*, u.username, u.avatar_color, u.net_profit
     FROM poker_with_friends_game_players gp
     JOIN poker_with_friends_users u ON gp.user_id = u.id
     WHERE gp.game_id = $1
     ORDER BY gp.seat_index ASC`,
    [numGameId]
  );

  const defaultState = createInitialGameState(gameRow.big_blind);
  const loadedState = {
    ...defaultState,
    ...(gameRow.game_state || {}),
    playerStates: (gameRow.game_state && gameRow.game_state.playerStates) || {},
  };

  const table = {
    id: gameRow.id,
    name: gameRow.name,
    createdBy: gameRow.created_by,
    creatorUsername: gameRow.creator_username || 'System',
    smallBlind: Number(gameRow.small_blind),
    bigBlind: Number(gameRow.big_blind),
    maxPlayers: Number(gameRow.max_players),
    status: gameRow.status,
    isPaused: Boolean(gameRow.is_paused),
    dealerSeat: Number(gameRow.dealer_seat || 0),
    handNumber: Number(gameRow.hand_number || 0),
    state: loadedState,
    players: playersRes.rows.map((r) => ({
      id: r.id,
      userId: Number(r.user_id),
      username: r.username,
      avatarColor: r.avatar_color,
      seatIndex: Number(r.seat_index),
      chips: Number(r.chips),
      totalBuyIn: Number(r.total_buy_in),
      isSittingOut: Boolean(r.is_sitting_out),
      isAtTable: Boolean(r.is_at_table),
      pendingTopUp: Number(r.pending_top_up || 0),
    })),
  };

  activeTables.set(numGameId, table);
  return table;
}

export async function getTable(gameId) {
  const numGameId = Number(gameId);
  if (activeTables.has(numGameId)) {
    return activeTables.get(numGameId);
  }
  return loadTableFromDb(numGameId);
}

/**
 * Persists the current in-memory table state & player stacks to PostgreSQL
 */
export async function persistTableToDb(table) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE poker_with_friends_games
       SET name = $1,
           small_blind = $2,
           big_blind = $3,
           max_players = $4,
           status = $5,
           is_paused = $6,
           dealer_seat = $7,
           hand_number = $8,
           game_state = $9,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        table.name,
        table.smallBlind,
        table.bigBlind,
        table.maxPlayers,
        table.status,
        table.isPaused,
        table.dealerSeat,
        table.handNumber,
        JSON.stringify(table.state),
        table.id,
      ]
    );

    for (const p of table.players) {
      await client.query(
        `UPDATE poker_with_friends_game_players
         SET seat_index = $1,
             chips = $2,
             total_buy_in = $3,
             is_sitting_out = $4,
             is_at_table = $5,
             pending_top_up = $6
         WHERE game_id = $7 AND user_id = $8`,
        [
          p.seatIndex,
          p.chips,
          p.totalBuyIn,
          p.isSittingOut,
          p.isAtTable,
          p.pendingTopUp || 0,
          table.id,
          p.userId,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`Error persisting table ${table.id}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Formats a sanitized public view of the table for a specific viewerUserId.
 * Hides other players' holeCards unless the phase is 'showdown' and they haven't folded,
 * or the player explicitly revealed their cards.
 */
export function serializeTableForUser(table, viewerUserId) {
  const state = table.state;
  const maxStackCap = getCapInChips(table.bigBlind);

  const seats = [];
  for (let i = 0; i < table.maxPlayers; i++) {
    const player = table.players.find((p) => p.seatIndex === i) || null;
    if (!player) {
      seats.push({ seatIndex: i, player: null });
      continue;
    }

    const ps = state.playerStates[i] || {
      holeCards: [],
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
      lastAction: null,
      revealedCards: false,
      handResult: null,
    };

    const isViewer = Number(player.userId) === Number(viewerUserId);
    const showCards =
      isViewer ||
      ps.revealedCards ||
      (state.phase === 'showdown' && !ps.folded && ps.holeCards && ps.holeCards.length === 2);

    seats.push({
      seatIndex: i,
      player: {
        userId: player.userId,
        username: player.username,
        avatarColor: player.avatarColor,
        chips: player.chips,
        chipsInBB: Number((player.chips / table.bigBlind).toFixed(1)),
        totalBuyIn: player.totalBuyIn,
        isSittingOut: player.isSittingOut,
        isAtTable: player.isAtTable,
        pendingTopUp: player.pendingTopUp || 0,
        currentBet: ps.currentBet || 0,
        totalHandBet: ps.totalHandBet || 0,
        folded: Boolean(ps.folded),
        allIn: Boolean(ps.allIn),
        lastAction: ps.lastAction || null,
        handResult: ps.handResult || null,
        revealedCards: Boolean(ps.revealedCards),
        hasCards: Boolean(ps.holeCards && ps.holeCards.length === 2),
        holeCards: showCards ? ps.holeCards || [] : ps.holeCards?.length === 2 ? ['??', '??'] : [],
      },
    });
  }

  // Compute legal actions if it is viewer's turn
  let legalActions = null;
  const viewerPlayer = table.players.find((p) => Number(p.userId) === Number(viewerUserId));
  if (
    viewerPlayer &&
    !table.isPaused &&
    ['preflop', 'flop', 'turn', 'river'].includes(state.phase) &&
    state.currentTurnSeat === viewerPlayer.seatIndex
  ) {
    const ps = state.playerStates[viewerPlayer.seatIndex];
    if (ps && !ps.folded && !ps.allIn) {
      const toCall = Math.max(0, state.currentBet - (ps.currentBet || 0));
      const canCheck = toCall === 0;
      const callAmount = Math.min(viewerPlayer.chips, toCall);
      const maxTotalBet = (ps.currentBet || 0) + viewerPlayer.chips;
      const canRaise = maxTotalBet > state.currentBet;
      const minRaiseTotal = Math.min(
        maxTotalBet,
        state.currentBet === 0
          ? Math.max(table.bigBlind, state.minRaise)
          : state.currentBet + state.minRaise
      );

      legalActions = {
        canFold: true,
        canCheck,
        canCall: toCall > 0,
        callAmount,
        canRaise,
        minRaiseTotal,
        maxRaiseTotal: maxTotalBet,
        currentStreetBet: ps.currentBet || 0,
        currentTableBet: state.currentBet,
      };
    }
  }

  // Determine if viewer can start a hand
  const eligiblePlayers = table.players.filter((p) => !p.isSittingOut && p.chips > 0);
  const canStartHand =
    !table.isPaused &&
    (state.phase === 'waiting' || state.phase === 'showdown') &&
    eligiblePlayers.length >= 2;

  // Can viewer reveal their cards right now?
  let canShowCards = false;
  if (viewerPlayer && (state.phase === 'showdown' || state.phase === 'waiting')) {
    const ps = state.playerStates[viewerPlayer.seatIndex];
    if (ps && ps.holeCards && ps.holeCards.length === 2 && !ps.revealedCards) {
      canShowCards = true;
    }
  }

  return {
    id: table.id,
    name: table.name,
    createdBy: table.createdBy,
    creatorUsername: table.creatorUsername,
    smallBlind: table.smallBlind,
    bigBlind: table.bigBlind,
    maxBuyIn: maxStackCap,
    maxPlayers: table.maxPlayers,
    status: table.status,
    isPaused: table.isPaused,
    dealerSeat: table.dealerSeat,
    handNumber: table.handNumber,
    phase: state.phase,
    communityCards: state.communityCards || [],
    pot: state.pot || 0,
    sidePots: state.sidePots || [],
    currentTurnSeat: state.currentTurnSeat,
    smallBlindSeat: state.smallBlindSeat,
    bigBlindSeat: state.bigBlindSeat,
    currentBet: state.currentBet || 0,
    minRaise: state.minRaise || table.bigBlind,
    lastActionText: state.lastActionText || '',
    actionLog: (state.actionLog || []).slice(-25),
    winners: state.winners || [],
    winningCards: state.winningCards || [],
    seats,
    legalActions,
    canStartHand,
    canShowCards,
  };
}

/**
 * Helper to append an entry to the table action log
 */
function addLog(table, text) {
  table.state.lastActionText = text;
  if (!Array.isArray(table.state.actionLog)) {
    table.state.actionLog = [];
  }
  table.state.actionLog.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: new Date().toISOString(),
    text,
  });
  if (table.state.actionLog.length > 50) {
    table.state.actionLog = table.state.actionLog.slice(-50);
  }
}

/**
 * Clear any pending auto-next-hand timer for a table
 */
export function clearNextHandTimer(gameId) {
  const numId = Number(gameId);
  if (nextHandTimers.has(numId)) {
    clearTimeout(nextHandTimers.get(numId));
    nextHandTimers.delete(numId);
  }
}

/**
 * Schedules the next hand to deal automatically after showdown if not paused
 */
export function scheduleNextHand(gameId, onStateUpdated, delayMs = 5500) {
  const numId = Number(gameId);
  clearNextHandTimer(numId);
  const timer = setTimeout(async () => {
    nextHandTimers.delete(numId);
    try {
      const table = await getTable(numId);
      if (!table || table.isPaused) return;
      if (table.state.phase !== 'showdown' && table.state.phase !== 'waiting') return;
      await applyPendingTopUps(table);
      const eligible = table.players.filter((p) => !p.isSittingOut && p.chips > 0);
      if (eligible.length >= 2) {
        await startNewHand(table);
        if (onStateUpdated) onStateUpdated(table);
      }
    } catch (err) {
      console.error('Auto-deal next hand error:', err);
    }
  }, delayMs);
  nextHandTimers.set(numId, timer);
}

/**
 * Applies any queued top-ups for players (always capped so chips <= 100 BB)
 */
export async function applyPendingTopUps(table) {
  const cap = getCapInChips(table.bigBlind);
  let changed = false;
  for (const p of table.players) {
    if (p.pendingTopUp > 0) {
      const maxAdd = Math.max(0, cap - p.chips);
      const actualAdd = Math.min(p.pendingTopUp, maxAdd);
      if (actualAdd > 0) {
        p.chips += actualAdd;
        p.totalBuyIn += actualAdd;
        // Track buy-in against user's net_profit on cash out, or update incrementally:
        await query(
          `UPDATE poker_with_friends_users SET net_profit = net_profit - $1 WHERE id = $2`,
          [actualAdd, p.userId]
        );
        addLog(table, `${p.username} topped up +${actualAdd} chips (Stack: ${p.chips} / 100 BB).`);
      }
      p.pendingTopUp = 0;
      changed = true;
    }
  }
  if (changed) {
    await persistTableToDb(table);
  }
}

/**
 * Seats a user at a specific seat (or first available seat) with up to 100 BB
 */
export async function joinTableSeat(gameId, user, requestedSeatIndex = null, requestedBuyIn = null) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  const cap = getCapInChips(table.bigBlind);

  // Check if user is already seated at this table
  const existingPlayer = table.players.find((p) => Number(p.userId) === Number(user.id));
  if (existingPlayer) {
    existingPlayer.isAtTable = true;
    existingPlayer.isSittingOut = false;
    // If they had 0 chips, automatically top them up to 100 BB!
    if (existingPlayer.chips === 0) {
      existingPlayer.chips = cap;
      existingPlayer.totalBuyIn += cap;
      await query(
        `UPDATE poker_with_friends_users SET net_profit = net_profit - $1 WHERE id = $2`,
        [cap, user.id]
      );
      addLog(table, `${user.username} rejoined seat #${existingPlayer.seatIndex + 1} with ${cap} chips (100 BB).`);
    } else {
      addLog(table, `${user.username} is back at seat #${existingPlayer.seatIndex + 1}.`);
    }
    await persistTableToDb(table);
    return table;
  }

  if (table.players.length >= table.maxPlayers) {
    throw new Error('Table is full');
  }

  let seatIndex = requestedSeatIndex;
  const occupiedSeats = new Set(table.players.map((p) => p.seatIndex));

  if (seatIndex === null || seatIndex === undefined || occupiedSeats.has(Number(seatIndex))) {
    seatIndex = null;
    for (let i = 0; i < table.maxPlayers; i++) {
      if (!occupiedSeats.has(i)) {
        seatIndex = i;
        break;
      }
    }
  } else {
    seatIndex = Number(seatIndex);
  }

  if (seatIndex === null || seatIndex < 0 || seatIndex >= table.maxPlayers) {
    throw new Error('No available seat');
  }

  const buyIn = requestedBuyIn
    ? Math.max(table.bigBlind * 10, Math.min(cap, Number(requestedBuyIn)))
    : cap;

  const insertRes = await query(
    `INSERT INTO poker_with_friends_game_players
      (game_id, user_id, seat_index, chips, total_buy_in, is_sitting_out, is_at_table, pending_top_up)
     VALUES ($1, $2, $3, $4, $4, false, true, 0)
     RETURNING id`,
    [table.id, user.id, seatIndex, buyIn]
  );

  await query(
    `UPDATE poker_with_friends_users SET net_profit = net_profit - $1 WHERE id = $2`,
    [buyIn, user.id]
  );

  table.players.push({
    id: insertRes.rows[0].id,
    userId: Number(user.id),
    username: user.username,
    avatarColor: user.avatar_color || '#10b981',
    seatIndex,
    chips: buyIn,
    totalBuyIn: buyIn,
    isSittingOut: false,
    isAtTable: true,
    pendingTopUp: 0,
  });
  table.players.sort((a, b) => a.seatIndex - b.seatIndex);

  addLog(table, `${user.username} sat at Seat #${seatIndex + 1} with ${buyIn} chips (${(buyIn / table.bigBlind).toFixed(0)} BB).`);
  await persistTableToDb(table);
  return table;
}

/**
 * Top up a player's chips up to the 100 BB cap!
 */
export async function topUpPlayerChips(gameId, userId, requestedAmount = null) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  const player = table.players.find((p) => Number(p.userId) === Number(userId));
  if (!player) throw new Error('You must take a seat at the table first');

  const cap = getCapInChips(table.bigBlind);
  const ps = table.state.playerStates[player.seatIndex];
  const isInActiveHand =
    ['preflop', 'flop', 'turn', 'river'].includes(table.state.phase) &&
    ps &&
    !ps.folded &&
    ps.holeCards &&
    ps.holeCards.length === 2;

  if (player.chips >= cap && !isInActiveHand) {
    throw new Error(`Your stack (${player.chips}) is already at or above the 100 BB cap (${cap} chips).`);
  }

  if (isInActiveHand) {
    // Queue top-up to 100 BB for immediately after this hand completes
    player.pendingTopUp = cap;
    addLog(table, `${player.username} queued a 100 BB top-up (${cap} chips) for the next hand.`);
    await persistTableToDb(table);
    return {
      table,
      queued: true,
      message: `Top-up to 100 BB (${cap} chips) queued and will be added as soon as this hand finishes!`,
    };
  }

  const maxNeeded = Math.max(0, cap - player.chips);
  const addAmount = requestedAmount
    ? Math.max(1, Math.min(maxNeeded, Number(requestedAmount)))
    : maxNeeded;

  if (addAmount <= 0) {
    throw new Error(`Your stack is already at the 100 BB cap (${cap} chips).`);
  }

  player.chips += addAmount;
  player.totalBuyIn += addAmount;
  player.pendingTopUp = 0;

  await query(
    `UPDATE poker_with_friends_users SET net_profit = net_profit - $1 WHERE id = $2`,
    [addAmount, player.userId]
  );

  addLog(
    table,
    `${player.username} added +${addAmount} chips (Stack: ${player.chips} chips / ${(player.chips / table.bigBlind).toFixed(0)} BB).`
  );
  await persistTableToDb(table);

  return {
    table,
    queued: false,
    added: addAmount,
    newChips: player.chips,
    message: `Added +${addAmount} chips! Stack is now ${player.chips} (${(player.chips / table.bigBlind).toFixed(0)} BB).`,
  };
}

/**
 * Player stands up (leaves their seat and cashes out their current stack)
 */
export async function standUpFromTable(gameId, userId, onStateUpdated) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  const playerIdx = table.players.findIndex((p) => Number(p.userId) === Number(userId));
  if (playerIdx === -1) return table;

  const player = table.players[playerIdx];
  const seatIndex = player.seatIndex;

  // If currently in an active hand, fold their hand first
  if (['preflop', 'flop', 'turn', 'river'].includes(table.state.phase)) {
    const ps = table.state.playerStates[seatIndex];
    if (ps && !ps.folded) {
      await handlePlayerAction(gameId, userId, { type: 'fold' }, onStateUpdated);
    }
  }

  // Credit player's remaining chips back to their career net_profit
  if (player.chips > 0) {
    await query(
      `UPDATE poker_with_friends_users SET net_profit = net_profit + $1 WHERE id = $2`,
      [player.chips, player.userId]
    );
  }

  await query(
    `DELETE FROM poker_with_friends_game_players WHERE game_id = $1 AND user_id = $2`,
    [table.id, player.userId]
  );

  table.players.splice(playerIdx, 1);
  delete table.state.playerStates[seatIndex];

  addLog(table, `${player.username} stood up from Seat #${seatIndex + 1} with ${player.chips} chips.`);
  await persistTableToDb(table);
  return table;
}

/**
 * Toggle Sit Out status for a player while keeping their seat & stack
 */
export async function toggleSitOut(gameId, userId) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  const player = table.players.find((p) => Number(p.userId) === Number(userId));
  if (!player) throw new Error('Not seated at this table');

  player.isSittingOut = !player.isSittingOut;
  addLog(
    table,
    `${player.username} is now ${player.isSittingOut ? 'sitting out' : 'back in Action'}.`
  );
  await persistTableToDb(table);
  return table;
}

/**
 * Pause or resume a game (preserving all mid-hand or waiting state in the DB)
 */
export async function setGamePaused(gameId, isPaused, actorUsername = 'A player') {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  table.isPaused = Boolean(isPaused);
  if (table.isPaused) {
    clearNextHandTimer(table.id);
    table.status = 'paused';
    addLog(table, `Game paused by ${actorUsername}. State saved to database.`);
  } else {
    table.status = ['preflop', 'flop', 'turn', 'river'].includes(table.state.phase)
      ? 'active'
      : 'waiting';
    addLog(table, `Game resumed by ${actorUsername}.`);
  }

  await persistTableToDb(table);
  return table;
}

/**
 * Edit game settings (name, smallBlind, bigBlind, maxPlayers, isPaused)
 */
export async function updateGameSettings(gameId, updates, actorUsername = 'A player') {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  if (updates.name && String(updates.name).trim()) {
    table.name = String(updates.name).trim();
  }
  if (updates.smallBlind !== undefined && Number(updates.smallBlind) > 0) {
    table.smallBlind = Math.floor(Number(updates.smallBlind));
  }
  if (updates.bigBlind !== undefined && Number(updates.bigBlind) > 0) {
    table.bigBlind = Math.max(table.smallBlind, Math.floor(Number(updates.bigBlind)));
  }
  if (updates.maxPlayers !== undefined) {
    const highestOccupiedSeat = table.players.reduce((m, p) => Math.max(m, p.seatIndex), 1);
    table.maxPlayers = Math.max(highestOccupiedSeat + 1, Math.min(9, Math.max(2, Number(updates.maxPlayers))));
  }
  if (updates.isPaused !== undefined) {
    table.isPaused = Boolean(updates.isPaused);
    if (table.isPaused) {
      clearNextHandTimer(table.id);
      table.status = 'paused';
    } else {
      table.status = ['preflop', 'flop', 'turn', 'river'].includes(table.state.phase)
        ? 'active'
        : 'waiting';
    }
  }

  addLog(
    table,
    `${actorUsername} updated game settings (${table.name}, Blinds ${table.smallBlind}/${table.bigBlind}, 100 BB Cap = ${getCapInChips(table.bigBlind)}).`
  );
  await persistTableToDb(table);
  return table;
}

/**
 * Finds the next active seat clockwise after `fromSeat` among `seatList` (sorted ascending)
 */
function getNextSeat(seatList, fromSeat) {
  if (seatList.length === 0) return null;
  for (const s of seatList) {
    if (s > fromSeat) return s;
  }
  return seatList[0];
}

/**
 * Starts a new hand of No-Limit Texas Hold'em!
 */
export async function startNewHand(table) {
  clearNextHandTimer(table.id);

  if (table.isPaused) {
    throw new Error('Cannot start a hand while the game is paused. Resume the game first.');
  }

  await applyPendingTopUps(table);

  const activePlayers = table.players
    .filter((p) => !p.isSittingOut && p.chips > 0)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  if (activePlayers.length < 2) {
    table.state.phase = 'waiting';
    table.status = 'waiting';
    addLog(table, 'Waiting for at least 2 players with chips to start a hand...');
    await persistTableToDb(table);
    return table;
  }

  const activeSeatIndices = activePlayers.map((p) => p.seatIndex);

  // Move dealer button clockwise
  const newDealerSeat =
    table.handNumber === 0 && activeSeatIndices.includes(table.dealerSeat)
      ? table.dealerSeat
      : getNextSeat(activeSeatIndices, table.dealerSeat);

  table.dealerSeat = newDealerSeat;
  table.handNumber += 1;
  table.status = 'active';

  // Determine Small Blind and Big Blind seats
  // Heads-Up (2 players): Dealer posts Small Blind, other player posts Big Blind
  let sbSeat;
  let bbSeat;
  let firstToActPreflop;

  if (activeSeatIndices.length === 2) {
    sbSeat = newDealerSeat;
    bbSeat = getNextSeat(activeSeatIndices, newDealerSeat);
    firstToActPreflop = sbSeat; // Dealer/SB acts first preflop in heads-up
  } else {
    sbSeat = getNextSeat(activeSeatIndices, newDealerSeat);
    bbSeat = getNextSeat(activeSeatIndices, sbSeat);
    firstToActPreflop = getNextSeat(activeSeatIndices, bbSeat);
  }

  const deck = createShuffledDeck();
  const playerStates = {};

  for (const p of activePlayers) {
    playerStates[p.seatIndex] = {
      holeCards: [deck.pop(), deck.pop()],
      currentBet: 0,
      totalHandBet: 0,
      folded: false,
      allIn: false,
      actedThisRound: false,
      lastAction: null,
      revealedCards: false,
      handResult: null,
    };
  }

  // Post Small Blind
  const sbPlayer = table.players.find((p) => p.seatIndex === sbSeat);
  const sbAmount = Math.min(sbPlayer.chips, table.smallBlind);
  sbPlayer.chips -= sbAmount;
  playerStates[sbSeat].currentBet = sbAmount;
  playerStates[sbSeat].totalHandBet = sbAmount;
  playerStates[sbSeat].allIn = sbPlayer.chips === 0;
  playerStates[sbSeat].lastAction = `SB ${sbAmount}`;

  // Post Big Blind
  const bbPlayer = table.players.find((p) => p.seatIndex === bbSeat);
  const bbAmount = Math.min(bbPlayer.chips, table.bigBlind);
  bbPlayer.chips -= bbAmount;
  playerStates[bbSeat].currentBet = bbAmount;
  playerStates[bbSeat].totalHandBet = bbAmount;
  playerStates[bbSeat].allIn = bbPlayer.chips === 0;
  playerStates[bbSeat].lastAction = `BB ${bbAmount}`;

  const initialPot = sbAmount + bbAmount;
  const currentBet = Math.max(sbAmount, bbAmount);

  table.state = {
    phase: 'preflop',
    deck,
    communityCards: [],
    pot: initialPot,
    sidePots: [],
    currentTurnSeat: firstToActPreflop,
    dealerSeat: newDealerSeat,
    smallBlindSeat: sbSeat,
    bigBlindSeat: bbSeat,
    currentBet,
    minRaise: table.bigBlind,
    lastActionText: `Hand #${table.handNumber} dealt! ${sbPlayer.username} posts SB (${sbAmount}), ${bbPlayer.username} posts BB (${bbAmount}).`,
    actionLog: table.state.actionLog || [],
    playerStates,
    winners: [],
    winningCards: [],
  };

  addLog(
    table,
    `--- Hand #${table.handNumber} (Blinds ${table.smallBlind}/${table.bigBlind}) --- ${sbPlayer.username} posts SB ${sbAmount}, ${bbPlayer.username} posts BB ${bbAmount}.`
  );

  // Increment hands_played for all active players in this hand
  for (const p of activePlayers) {
    await query(
      `UPDATE poker_with_friends_users SET hands_played = hands_played + 1 WHERE id = $1`,
      [p.userId]
    );
  }

  // Edge case: if SB or BB is already all-in and nobody can act
  await advanceStateIfNeeded(table);
  await persistTableToDb(table);
  return table;
}

/**
 * Calculates main pot and side pots from players' `totalHandBet`
 */
function calculateSidePots(table) {
  const entries = [];
  for (const [seatStr, ps] of Object.entries(table.state.playerStates)) {
    const seatIndex = Number(seatStr);
    const total = Number(ps.totalHandBet || 0);
    if (total > 0) {
      entries.push({
        seatIndex,
        total,
        folded: Boolean(ps.folded),
      });
    }
  }

  if (entries.length === 0) return [];

  // Distinct contribution levels of non-folded all-in players + maximum contribution level
  const allInLevels = entries
    .filter((e) => !e.folded)
    .map((e) => e.total)
    .sort((a, b) => a - b);

  const uniqueLevels = [...new Set(allInLevels)];
  const maxContribution = Math.max(...entries.map((e) => e.total));
  if (!uniqueLevels.includes(maxContribution)) {
    uniqueLevels.push(maxContribution);
  }

  const pots = [];
  let prevLevel = 0;

  for (const level of uniqueLevels) {
    if (level <= prevLevel) continue;
    let potAmount = 0;
    const eligibleSeats = [];

    for (const e of entries) {
      if (e.total > prevLevel) {
        const contribution = Math.min(e.total, level) - prevLevel;
        potAmount += contribution;
      }
      if (!e.folded && e.total >= level) {
        eligibleSeats.push(e.seatIndex);
      }
    }

    if (potAmount > 0) {
      pots.push({
        amount: potAmount,
        eligibleSeats,
      });
    }
    prevLevel = level;
  }

  return pots;
}

/**
 * Handles a player action: 'fold' | 'check' | 'call' | 'raise'
 */
export async function handlePlayerAction(gameId, userId, action, onStateUpdated) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');
  if (table.isPaused) throw new Error('Game is currently paused');

  const state = table.state;
  if (!['preflop', 'flop', 'turn', 'river'].includes(state.phase)) {
    throw new Error('No active betting round');
  }

  const player = table.players.find((p) => Number(p.userId) === Number(userId));
  if (!player) throw new Error('You are not seated at this table');

  if (state.currentTurnSeat !== player.seatIndex) {
    throw new Error('It is not your turn to act');
  }

  const ps = state.playerStates[player.seatIndex];
  if (!ps || ps.folded || ps.allIn) {
    throw new Error('You cannot act in this hand');
  }

  const type = action.type;
  const toCall = Math.max(0, state.currentBet - ps.currentBet);

  if (type === 'fold') {
    ps.folded = true;
    ps.actedThisRound = true;
    ps.lastAction = 'Fold';
    addLog(table, `${player.username} folds.`);
  } else if (type === 'check') {
    if (toCall > 0) {
      throw new Error(`Cannot check — ${toCall} to call`);
    }
    ps.actedThisRound = true;
    ps.lastAction = 'Check';
    addLog(table, `${player.username} checks.`);
  } else if (type === 'call') {
    if (toCall === 0) {
      ps.actedThisRound = true;
      ps.lastAction = 'Check';
      addLog(table, `${player.username} checks.`);
    } else {
      const callAmt = Math.min(player.chips, toCall);
      player.chips -= callAmt;
      ps.currentBet += callAmt;
      ps.totalHandBet += callAmt;
      state.pot += callAmt;
      ps.actedThisRound = true;
      if (player.chips === 0) {
        ps.allIn = true;
        ps.lastAction = `All-In (${ps.currentBet})`;
        addLog(table, `${player.username} calls ${callAmt} and is All-In!`);
      } else {
        ps.lastAction = `Call ${callAmt}`;
        addLog(table, `${player.username} calls ${callAmt}.`);
      }
    }
  } else if (type === 'raise' || type === 'bet') {
    // action.amount is the desired TOTAL bet on the current street (or we also support action.totalBet)
    const rawTarget = Number(action.amount ?? action.totalBet ?? 0);
    const maxPossibleTotal = ps.currentBet + player.chips;

    if (maxPossibleTotal <= state.currentBet) {
      throw new Error('Insufficient chips to raise; you can only call or fold');
    }

    const minLegalTotal =
      state.currentBet === 0
        ? Math.min(maxPossibleTotal, Math.max(table.bigBlind, state.minRaise))
        : Math.min(maxPossibleTotal, state.currentBet + state.minRaise);

    const targetTotalBet = Math.max(minLegalTotal, Math.min(maxPossibleTotal, Math.floor(rawTarget)));
    const addedChips = targetTotalBet - ps.currentBet;
    const raiseDelta = targetTotalBet - state.currentBet;

    player.chips -= addedChips;
    ps.currentBet = targetTotalBet;
    ps.totalHandBet += addedChips;
    state.pot += addedChips;
    ps.actedThisRound = true;

    // If full raise (or first bet on street), reopen action for other active players
    if (raiseDelta >= state.minRaise || state.currentBet === 0) {
      state.minRaise = Math.max(state.minRaise, raiseDelta);
      for (const [seatStr, otherPs] of Object.entries(state.playerStates)) {
        if (Number(seatStr) !== player.seatIndex && !otherPs.folded && !otherPs.allIn) {
          otherPs.actedThisRound = false;
        }
      }
    } else {
      // Short all-in raise: still requires players who haven't matched the previous bet to act
      for (const [seatStr, otherPs] of Object.entries(state.playerStates)) {
        if (
          Number(seatStr) !== player.seatIndex &&
          !otherPs.folded &&
          !otherPs.allIn &&
          otherPs.currentBet < targetTotalBet
        ) {
          otherPs.actedThisRound = false;
        }
      }
    }

    const wasZeroBet = state.currentBet === 0;
    state.currentBet = targetTotalBet;

    if (player.chips === 0) {
      ps.allIn = true;
      ps.lastAction = `All-In ${targetTotalBet}`;
      addLog(table, `${player.username} goes All-In to ${targetTotalBet}!`);
    } else if (wasZeroBet) {
      ps.lastAction = `Bet ${targetTotalBet}`;
      addLog(table, `${player.username} bets ${targetTotalBet}.`);
    } else {
      ps.lastAction = `Raise to ${targetTotalBet}`;
      addLog(table, `${player.username} raises to ${targetTotalBet}.`);
    }
  } else {
    throw new Error(`Unknown action type: ${type}`);
  }

  state.sidePots = calculateSidePots(table);

  await advanceStateIfNeeded(table, onStateUpdated);
  await persistTableToDb(table);
  return table;
}

/**
 * Checks if the hand or current betting street is complete, and transitions accordingly
 */
async function advanceStateIfNeeded(table, onStateUpdated) {
  const state = table.state;
  const activeSeats = Object.entries(state.playerStates)
    .filter(([, ps]) => !ps.folded)
    .map(([seatStr]) => Number(seatStr))
    .sort((a, b) => a - b);

  // 1. Everyone folded except 1 player -> immediate win without showdown!
  if (activeSeats.length === 1) {
    const winnerSeat = activeSeats[0];
    const winnerPlayer = table.players.find((p) => p.seatIndex === winnerSeat);
    const totalPot = state.pot;

    if (winnerPlayer) {
      winnerPlayer.chips += totalPot;
      await query(
        `UPDATE poker_with_friends_users SET hands_won = hands_won + 1 WHERE id = $1`,
        [winnerPlayer.userId]
      );
    }

    state.winners = [
      {
        seatIndex: winnerSeat,
        userId: winnerPlayer?.userId,
        username: winnerPlayer?.username || 'Player',
        amount: totalPot,
        handName: 'Opponents Folded',
      },
    ];
    state.winningCards = [];
    state.currentTurnSeat = null;
    state.phase = 'showdown';

    addLog(
      table,
      `${winnerPlayer?.username || 'Player'} wins ${totalPot} chips (opponents folded).`
    );

    await recordHandHistory(table);
    scheduleNextHand(table.id, onStateUpdated);
    return;
  }

  // 2. Check who can still act in the current street
  const seatsAbleToAct = activeSeats.filter((seat) => {
    const ps = state.playerStates[seat];
    return !ps.allIn;
  });

  const allMatchedAndActed = seatsAbleToAct.every((seat) => {
    const ps = state.playerStates[seat];
    return ps.actedThisRound && ps.currentBet === state.currentBet;
  });

  if (!allMatchedAndActed) {
    // Find next seat clockwise from currentTurnSeat that is !folded and !allIn and (!actedThisRound || currentBet < state.currentBet)
    const candidates = seatsAbleToAct.filter((seat) => {
      const ps = state.playerStates[seat];
      return !ps.actedThisRound || ps.currentBet < state.currentBet;
    });

    if (candidates.length > 0) {
      state.currentTurnSeat = getNextSeat(candidates, state.currentTurnSeat ?? state.dealerSeat);
      return;
    }
  }

  // Betting round is over! Move to next street or run out board if <= 1 player has chips left
  await moveToNextStreet(table, onStateUpdated);
}

/**
 * Transitions from preflop -> flop -> turn -> river -> showdown
 */
async function moveToNextStreet(table, onStateUpdated) {
  const state = table.state;

  // Reset street bets and actedThisRound flags
  for (const ps of Object.values(state.playerStates)) {
    ps.currentBet = 0;
    ps.actedThisRound = false;
    if (!ps.folded && !ps.allIn) {
      ps.lastAction = null;
    }
  }
  state.currentBet = 0;
  state.minRaise = table.bigBlind;

  const activeSeats = Object.entries(state.playerStates)
    .filter(([, ps]) => !ps.folded)
    .map(([seatStr]) => Number(seatStr))
    .sort((a, b) => a - b);

  const seatsWithChips = activeSeats.filter((s) => !state.playerStates[s].allIn);

  // If 0 or 1 player has chips left (everyone else in the hand is all-in), deal remaining board and go to showdown
  if (seatsWithChips.length <= 1) {
    while (state.communityCards.length < 5) {
      state.communityCards.push(state.deck.pop());
    }
    await resolveShowdown(table, onStateUpdated);
    return;
  }

  if (state.phase === 'preflop') {
    state.phase = 'flop';
    state.communityCards.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
    addLog(table, `*** FLOP *** [${state.communityCards.join(' ')}] (Pot: ${state.pot})`);
  } else if (state.phase === 'flop') {
    state.phase = 'turn';
    state.communityCards.push(state.deck.pop());
    addLog(table, `*** TURN *** [${state.communityCards.join(' ')}] (Pot: ${state.pot})`);
  } else if (state.phase === 'turn') {
    state.phase = 'river';
    state.communityCards.push(state.deck.pop());
    addLog(table, `*** RIVER *** [${state.communityCards.join(' ')}] (Pot: ${state.pot})`);
  } else if (state.phase === 'river') {
    await resolveShowdown(table, onStateUpdated);
    return;
  }

  // Postflop: first active player with chips left of the dealer button acts first
  state.currentTurnSeat = getNextSeat(seatsWithChips, state.dealerSeat);
}

/**
 * Evaluates all active hands at Showdown and distributes Main Pot + Side Pots
 */
async function resolveShowdown(table, onStateUpdated) {
  const state = table.state;
  state.phase = 'showdown';
  state.currentTurnSeat = null;

  const pots = calculateSidePots(table);
  state.sidePots = pots;

  // Evaluate each non-folded player's 7-card hand
  const evaluations = {};
  for (const [seatStr, ps] of Object.entries(state.playerStates)) {
    const seat = Number(seatStr);
    if (!ps.folded && ps.holeCards && ps.holeCards.length === 2) {
      const sevenCards = [...ps.holeCards, ...state.communityCards];
      const evalRes = evaluateHoldemHand(sevenCards);
      evaluations[seat] = evalRes;
      ps.handResult = evalRes ? evalRes.name : null;
      ps.revealedCards = true;
    }
  }

  const winningsBySeat = new Map();
  const winningHandsBySeat = new Map();
  const winningCardsSet = new Set();

  for (const pot of pots) {
    const eligible = pot.eligibleSeats.filter((s) => evaluations[s]);
    if (eligible.length === 0) continue;

    let bestScore = -1;
    for (const s of eligible) {
      if (evaluations[s].score > bestScore) {
        bestScore = evaluations[s].score;
      }
    }

    const potWinners = eligible.filter((s) => evaluations[s].score === bestScore);
    const share = Math.floor(pot.amount / potWinners.length);
    let remainder = pot.amount % potWinners.length;

    // Sort potWinners clockwise starting left of dealerSeat for odd-chip distribution
    const orderedWinners = [...potWinners].sort((a, b) => {
      const distA = (a - state.dealerSeat - 1 + table.maxPlayers) % table.maxPlayers;
      const distB = (b - state.dealerSeat - 1 + table.maxPlayers) % table.maxPlayers;
      return distA - distB;
    });

    for (const wSeat of orderedWinners) {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder -= 1;
      const wonAmt = share + extra;
      winningsBySeat.set(wSeat, (winningsBySeat.get(wSeat) || 0) + wonAmt);
      winningHandsBySeat.set(wSeat, evaluations[wSeat].name);
      for (const c of evaluations[wSeat].bestCards || []) {
        winningCardsSet.add(c);
      }
    }
  }

  const winnersList = [];
  for (const [seat, amount] of winningsBySeat.entries()) {
    const player = table.players.find((p) => p.seatIndex === seat);
    if (player && amount > 0) {
      player.chips += amount;
      await query(
        `UPDATE poker_with_friends_users SET hands_won = hands_won + 1 WHERE id = $1`,
        [player.userId]
      );
      winnersList.push({
        seatIndex: seat,
        userId: player.userId,
        username: player.username,
        amount,
        handName: winningHandsBySeat.get(seat) || 'Best Hand',
      });
    }
  }

  state.winners = winnersList;
  state.winningCards = Array.from(winningCardsSet);

  const summaryParts = winnersList.map(
    (w) => `${w.username} wins ${w.amount} with ${w.handName}`
  );
  addLog(table, `*** SHOWDOWN *** ${summaryParts.join(' | ')}`);

  await recordHandHistory(table);
  scheduleNextHand(table.id, onStateUpdated);
}

/**
 * Allows a player to voluntarily reveal their hole cards at the end of a hand
 */
export async function revealPlayerCards(gameId, userId) {
  const table = await getTable(gameId);
  if (!table) throw new Error('Game not found');

  const player = table.players.find((p) => Number(p.userId) === Number(userId));
  if (!player) throw new Error('Not seated');

  const ps = table.state.playerStates[player.seatIndex];
  if (!ps || !ps.holeCards || ps.holeCards.length !== 2) {
    throw new Error('No cards to show');
  }

  ps.revealedCards = true;
  addLog(table, `${player.username} shows [${ps.holeCards.join(' ')}]!`);
  await persistTableToDb(table);
  return table;
}

/**
 * Saves completed hand history into `poker_with_friends_hand_history`
 */
async function recordHandHistory(table) {
  try {
    const snapshot = table.players.map((p) => ({
      userId: p.userId,
      username: p.username,
      seatIndex: p.seatIndex,
      chipsAfter: p.chips,
      holeCards: table.state.playerStates[p.seatIndex]?.holeCards || [],
    }));

    await query(
      `INSERT INTO poker_with_friends_hand_history
        (game_id, hand_number, pot_total, community_cards, winners, actions_log, players_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        table.id,
        table.handNumber,
        table.state.pot || 0,
        JSON.stringify(table.state.communityCards || []),
        JSON.stringify(table.state.winners || []),
        JSON.stringify((table.state.actionLog || []).slice(-20)),
        JSON.stringify(snapshot),
      ]
    );
  } catch (err) {
    console.error('Failed to record hand history:', err.message);
  }
}

