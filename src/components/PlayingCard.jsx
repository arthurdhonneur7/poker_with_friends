import React from 'react';

const SUIT_SYMBOLS = {
  s: '♠',
  h: '♥',
  d: '♦',
  c: '♣',
};

const SUIT_COLORS = {
  s: 'text-slate-900', // Black Spades
  h: 'text-rose-600',  // Red Hearts
  d: 'text-blue-600',  // Blue Diamonds (4-color clarity)
  c: 'text-emerald-700', // Green Clubs
};

export default function PlayingCard({ card, isWinning = false, size = 'md', className = '' }) {
  if (!card || card === '??') {
    // Face-down card
    const sizeClasses = {
      sm: 'w-8 h-12 text-xs',
      md: 'w-12 h-16 text-sm',
      lg: 'w-16 h-22 text-base',
    }[size] || 'w-12 h-16 text-sm';

    return (
      <div
        className={`${sizeClasses} bg-gradient-to-br from-indigo-800 to-blue-950 rounded-md border border-indigo-400/30 shadow-md flex items-center justify-center select-none relative overflow-hidden ${className}`}
      >
        <div className="absolute inset-1 border border-indigo-300/20 rounded-[4px] flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-700/40 via-transparent to-transparent">
          <span className="text-indigo-300/60 font-mono font-bold text-xs">♠</span>
        </div>
      </div>
    );
  }

  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const symbol = SUIT_SYMBOLS[suit] || suit;
  const colorClass = SUIT_COLORS[suit] || 'text-slate-900';

  const sizeClasses = {
    sm: 'w-8 h-12 text-xs p-1',
    md: 'w-12 h-16 text-sm p-1.5',
    lg: 'w-16 h-22 text-base p-2',
  }[size] || 'w-12 h-16 text-sm p-1.5';

  return (
    <div
      className={`${sizeClasses} bg-white rounded-md border ${
        isWinning
          ? 'border-amber-400 ring-2 ring-amber-400/80 shadow-[0_0_15px_rgba(251,191,36,0.5)] -translate-y-1'
          : 'border-slate-300/80 shadow-md'
      } flex flex-col justify-between select-none transition-all duration-200 animate-deal ${className}`}
    >
      <div className={`flex items-center justify-between font-bold leading-none ${colorClass}`}>
        <span className="font-mono">{rank}</span>
        <span className="text-[1.1em]">{symbol}</span>
      </div>
      <div className={`self-center text-xl font-bold leading-none ${colorClass} opacity-90`}>
        {symbol}
      </div>
      <div className={`flex items-center justify-between font-bold leading-none rotate-180 ${colorClass}`}>
        <span className="font-mono">{rank}</span>
        <span className="text-[1.1em]">{symbol}</span>
      </div>
    </div>
  );
}

