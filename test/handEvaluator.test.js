import { describe, it, expect } from 'vitest';
import { evaluateHoldemHand, compareEvaluatedHands } from '../server/handEvaluator.js';

describe('Texas Holdem Hand Evaluator', () => {
  it('identifies a Royal Flush', () => {
    const hand = ['As', 'Ks', 'Qs', 'Js', 'Ts', '2c', '3d'];
    const res = evaluateHoldemHand(hand);
    expect(res.category).toBe(8);
    expect(res.name).toBe('Royal Flush');
  });

  it('identifies Ace-low Wheel straight', () => {
    const hand = ['Ah', '2c', '3d', '4s', '5h', 'Kd', '9c'];
    const res = evaluateHoldemHand(hand);
    expect(res.category).toBe(4);
    expect(res.shortName).toBe('Straight');
  });

  it('compares Full House over Flush', () => {
    const fullHouse = evaluateHoldemHand(['As', 'Ah', 'Ad', 'Ks', 'Kh', '2c', '3d']);
    const flush = evaluateHoldemHand(['2s', '5s', '8s', 'Js', 'Ks', 'Ad', 'Qc']);
    expect(compareEvaluatedHands(fullHouse, flush)).toBeGreaterThan(0);
  });

  it('correctly compares two pairs with kicker', () => {
    const handA = evaluateHoldemHand(['As', 'Ad', 'Ks', 'Kd', 'Qc', '2h', '3d']); // AA KK Q
    const handB = evaluateHoldemHand(['As', 'Ac', 'Kh', 'Kc', 'Jc', '4h', '5d']); // AA KK J
    expect(compareEvaluatedHands(handA, handB)).toBeGreaterThan(0);
  });
});

