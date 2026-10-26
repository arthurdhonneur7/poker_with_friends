import crypto from 'crypto';

export const SUITS = ['s', 'h', 'd', 'c']; // spades, hearts, diamonds, clubs
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const RANK_VALUES = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  'T': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

export const RANK_NAMES = {
  14: 'Ace',
  13: 'King',
  12: 'Queen',
  11: 'Jack',
  10: 'Ten',
  9: 'Nine',
  8: 'Eight',
  7: 'Seven',
  6: 'Six',
  5: 'Five',
  4: 'Four',
  3: 'Three',
  2: 'Two',
  1: 'Ace',
};

export const RANK_PLURAL = {
  14: 'Aces',
  13: 'Kings',
  12: 'Queens',
  11: 'Jacks',
  10: 'Tens',
  9: 'Nines',
  8: 'Eights',
  7: 'Sevens',
  6: 'Sixes',
  5: 'Fives',
  4: 'Fours',
  3: 'Threes',
  2: 'Twos',
};

/**
 * Creates a fresh 52-card deck shuffled with CSPRNG (crypto.randomInt)
 */
export function createShuffledDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${r}${s}`);
    }
  }
  // Fisher-Yates shuffle using crypto.randomInt
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = deck[i];
    deck[i] = deck[j];
    deck[j] = temp;
  }
  return deck;
}

/**
 * Evaluates a single 5-card hand.
 * Each card is a 2-char string like 'As', 'Td', '7h', '2c'.
 */
export function evaluate5CardHand(cards) {
  const parsed = cards.map((c) => ({
    card: c,
    rank: RANK_VALUES[c[0]],
    suit: c[1],
  }));

  parsed.sort((a, b) => b.rank - a.rank);

  const isFlush = parsed.every((c) => c.suit === parsed[0].suit);

  const ranks = parsed.map((c) => c.rank);
  const uniqueRanks = [...new Set(ranks)];

  let isStraight = false;
  let straightHigh = 0;

  if (uniqueRanks.length === 5) {
    if (uniqueRanks[0] - uniqueRanks[4] === 4) {
      isStraight = true;
      straightHigh = uniqueRanks[0];
    } else if (
      uniqueRanks[0] === 14 &&
      uniqueRanks[1] === 5 &&
      uniqueRanks[2] === 4 &&
      uniqueRanks[3] === 3 &&
      uniqueRanks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5; // Wheel A-2-3-4-5
    }
  }

  // Count rank frequencies
  const counts = new Map();
  for (const r of ranks) {
    counts.set(r, (counts.get(r) || 0) + 1);
  }

  // Sort groups by count DESC, then rank DESC
  const groups = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  let category = 0;
  let tiebreakers = [];
  let name = '';
  let shortName = '';

  if (isFlush && isStraight) {
    category = 8;
    tiebreakers = [straightHigh];
    if (straightHigh === 14) {
      name = 'Royal Flush';
      shortName = 'Royal Flush';
    } else {
      name = `Straight Flush, ${RANK_NAMES[straightHigh]} High`;
      shortName = 'Straight Flush';
    }
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreakers = [groups[0][0], groups[1][0]];
    name = `Four of a Kind, ${RANK_PLURAL[groups[0][0]]}`;
    shortName = 'Four of a Kind';
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreakers = [groups[0][0], groups[1][0]];
    name = `Full House, ${RANK_PLURAL[groups[0][0]]} full of ${RANK_PLURAL[groups[1][0]]}`;
    shortName = 'Full House';
  } else if (isFlush) {
    category = 5;
    tiebreakers = ranks;
    name = `Flush, ${RANK_NAMES[ranks[0]]} High`;
    shortName = 'Flush';
  } else if (isStraight) {
    category = 4;
    tiebreakers = [straightHigh];
    name = `Straight, ${RANK_NAMES[straightHigh]} High`;
    shortName = 'Straight';
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0]];
    name = `Three of a Kind, ${RANK_PLURAL[groups[0][0]]}`;
    shortName = 'Three of a Kind';
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0]];
    name = `Two Pair, ${RANK_PLURAL[groups[0][0]]} & ${RANK_PLURAL[groups[1][0]]}`;
    shortName = 'Two Pair';
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreakers = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
    name = `Pair of ${RANK_PLURAL[groups[0][0]]}`;
    shortName = `Pair of ${RANK_PLURAL[groups[0][0]]}`;
  } else {
    category = 0;
    tiebreakers = ranks;
    name = `High Card, ${RANK_NAMES[ranks[0]]}`;
    shortName = `${RANK_NAMES[ranks[0]]} High`;
  }

  // Compute an exact numeric score in base-16 for fast comparison
  let score = category;
  for (let i = 0; i < 5; i++) {
    score = score * 16 + (tiebreakers[i] || 0);
  }

  return {
    category,
    tiebreakers,
    score,
    name,
    shortName,
    bestCards: parsed.map((p) => p.card),
  };
}

/**
 * Generates all k-combinations of an array
 */
function getCombinations(arr, k) {
  const results = [];
  function helper(start, combo) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return results;
}

/**
 * Evaluates a 5, 6, or 7-card Hold'em hand and returns the best 5-card evaluation.
 */
export function evaluateHoldemHand(cards) {
  if (!cards || cards.length < 5) {
    return null;
  }
  const combos = getCombinations(cards, 5);
  let best = null;
  for (const combo of combos) {
    const evalResult = evaluate5CardHand(combo);
    if (!best || evalResult.score > best.score) {
      best = evalResult;
    }
  }
  return best;
}

/**
 * Compares two evaluated hands. Returns >0 if handA > handB, <0 if handA < handB, 0 if tie.
 */
export function compareEvaluatedHands(handA, handB) {
  return handA.score - handB.score;
}

