import React, { useState, useEffect, useRef } from 'react';
import { getSocket, apiRequest } from '../api';
import PlayingCard from './PlayingCard';
import {
  ArrowLeft,
  Pause,
  Play,
  Settings,
  PlusCircle,
  Coins,
  Eye,
  MessageSquare,
  History,
  Send,
  UserX,
  Volume2,
  VolumeX,
} from 'lucide-react';

export default function PokerTable({ gameId, currentUser, onLeaveToLobby }) {
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Top Up Modal state
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(0);

  // Edit Table Modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editSmallBlind, setEditSmallBlind] = useState(1);
  const [editBigBlind, setEditBigBlind] = useState(2);
  const [editIsPaused, setEditIsPaused] = useState(false);

  // Raise slider state
  const [raiseAmount, setRaiseAmount] = useState(0);

  // Chat & History panel
  const [activeSidePanel, setActiveSidePanel] = useState('chat'); // 'chat' | 'history'
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [handHistory, setHandHistory] = useState([]);

  const socket = getSocket();
  const chatBottomRef = useRef(null);

  // Fetch initial state & connect socket
  useEffect(() => {
    let isMounted = true;

    async function loadTable() {
      try {
        const data = await apiRequest(`/games/${gameId}`);
        if (isMounted) {
          setTable(data.table);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || 'Failed to load table');
          setLoading(false);
        }
      }
    }

    loadTable();

    socket.emit('join_game_room', { gameId, token: localStorage.getItem('poker_token') });

    const handleTableUpdate = (updatedTable) => {
      setTable(updatedTable);
    };

    const handleErrorMessage = (msg) => {
      setError(msg);
      setTimeout(() => setError(''), 4000);
    };

    const handleInfoMessage = (msg) => {
      setInfoMessage(msg);
      setTimeout(() => setInfoMessage(''), 4000);
    };

    const handleNewChat = (chatItem) => {
      setChatMessages((prev) => [...prev, chatItem].slice(-40));
    };

    socket.on('table_update', handleTableUpdate);
    socket.on('error_message', handleErrorMessage);
    socket.on('info_message', handleInfoMessage);
    socket.on('new_chat', handleNewChat);

    return () => {
      isMounted = false;
      socket.emit('leave_game_room', { gameId });
      socket.off('table_update', handleTableUpdate);
      socket.off('error_message', handleErrorMessage);
      socket.off('info_message', handleInfoMessage);
      socket.off('new_chat', handleNewChat);
    };
  }, [gameId]);

  // Sync raise amount with legal actions when turn changes
  useEffect(() => {
    if (table?.legalActions?.canRaise) {
      setRaiseAmount(table.legalActions.minRaiseTotal);
    }
  }, [table?.legalActions?.minRaiseTotal, table?.legalActions?.canRaise]);

  // Scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchHistory = async () => {
    try {
      const data = await apiRequest(`/games/${gameId}/history`);
      setHandHistory(data.history || []);
    } catch (err) {
      console.error('Failed to load hand history:', err);
    }
  };

  const handleTakeSeat = (seatIndex) => {
    socket.emit('join_seat', { gameId, seatIndex });
  };

  const handleStandUp = () => {
    if (window.confirm('Are you sure you want to stand up and leave your seat? Your stack will be cashed out.')) {
      socket.emit('stand_up', { gameId });
    }
  };

  const handleToggleSitOut = () => {
    socket.emit('toggle_sit_out', { gameId });
  };

  const handleAction = (type, amount = null) => {
    socket.emit('player_action', { gameId, action: { type, amount } });
  };

  const handleStartHand = () => {
    socket.emit('start_hand', { gameId });
  };

  const handleShowCards = () => {
    socket.emit('show_cards', { gameId });
  };

  const handleTogglePause = () => {
    socket.emit('toggle_pause', { gameId });
  };

  const handlePauseAndReturn = async () => {
    try {
      if (!table.isPaused) {
        await apiRequest(`/games/${gameId}`, 'PATCH', { isPaused: true });
      }
      onLeaveToLobby();
    } catch {
      onLeaveToLobby();
    }
  };

  const handleOpenTopUp = () => {
    const cap = table.maxBuyIn || table.bigBlind * 100;
    const seatedMe = table.seats.find((s) => s.player && s.player.userId === currentUser.id);
    const myChips = seatedMe ? seatedMe.player.chips : 0;
    const needed = Math.max(0, cap - myChips);
    setTopUpAmount(needed);
    setShowTopUpModal(true);
  };

  const handleConfirmTopUp = () => {
    socket.emit('top_up', { gameId, amount: topUpAmount });
    setShowTopUpModal(false);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/games/${gameId}`, 'PATCH', {
        name: editName,
        smallBlind: editSmallBlind,
        bigBlind: editBigBlind,
        isPaused: editIsPaused,
      });
      setShowEditModal(false);
    } catch (err) {
      alert(err.message || 'Failed to update game');
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    socket.emit('chat_message', { gameId, message: chatInput });
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Loading Cash Table...</p>
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white p-4">
        <p className="text-rose-400 text-sm mb-4">Game not found or error loading table.</p>
        <button
          onClick={onLeaveToLobby}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const mySeat = table.seats.find((s) => s.player && s.player.userId === currentUser.id);
  const myPlayer = mySeat ? mySeat.player : null;
  const isMyTurn = myPlayer && table.currentTurnSeat === mySeat.seatIndex;
  const cap = table.maxBuyIn || table.bigBlind * 100;

  // Seat positioning geometry (oval table)
  const totalSeats = table.maxPlayers || 8;
  const getSeatPositionStyle = (seatIndex) => {
    // Distribute seats around an ellipse
    // Seat 0 at bottom center or distributed evenly starting from bottom
    const angle = (seatIndex / totalSeats) * 2 * Math.PI + Math.PI / 2;
    const rx = 44; // percent
    const ry = 40; // percent
    const x = 50 + rx * Math.cos(angle);
    const y = 50 + ry * Math.sin(angle);
    return {
      left: `${x}%`,
      top: `${y}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden select-none">
      {/* Table Header Bar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            onClick={onLeaveToLobby}
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Return to Lobby (Keeps your seat in database)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Lobby</span>
          </button>

          <button
            onClick={handlePauseAndReturn}
            className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            title="Pause game and return to lobby. Table stays in DB!"
          >
            <Pause className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Pause & Exit</span>
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-white text-sm sm:text-base leading-tight truncate max-w-[140px] sm:max-w-xs">
                {table.name}
              </h2>
              {table.isPaused && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  PAUSED
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 flex items-center gap-2">
              <span>Blinds: <strong className="text-white font-mono">{table.smallBlind}/{table.bigBlind}</strong></span>
              <span>•</span>
              <span>Cap: <strong className="text-amber-400 font-mono">{cap} (100 BB)</strong></span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2">
          {/* Top-up Button (Capped at 100BB) */}
          {myPlayer && (
            <button
              onClick={handleOpenTopUp}
              className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-amber-500/20 active:scale-95 transition cursor-pointer"
              title="Top up stack up to 100 BB cap"
            >
              <Coins className="w-4 h-4" />
              <span>Add Chips (100 BB)</span>
            </button>
          )}

          {/* Pause / Resume Table */}
          <button
            onClick={handleTogglePause}
            className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
              table.isPaused
                ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                : 'border-slate-700 text-slate-300 bg-slate-800 hover:text-white'
            }`}
            title={table.isPaused ? 'Resume Game' : 'Pause Game'}
          >
            {table.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Edit Table */}
          <button
            onClick={() => {
              setEditName(table.name);
              setEditSmallBlind(table.smallBlind);
              setEditBigBlind(table.bigBlind);
              setEditIsPaused(table.isPaused);
              setShowEditModal(true);
            }}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Table Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Alert Notifications */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xl animate-deal">
          {error}
        </div>
      )}
      {infoMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-2xl animate-deal">
          {infoMessage}
        </div>
      )}

      {/* Main Table Area + Side Drawer */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* Felt Area */}
        <div className="flex-1 flex flex-col justify-between items-center p-2 sm:p-6 relative">
          {/* Paused Overlay Banner */}
          {table.isPaused && (
            <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-xs z-20 flex flex-col items-center justify-center pointer-events-auto">
              <div className="bg-slate-900 border border-amber-500/40 p-6 rounded-2xl shadow-2xl text-center max-w-sm">
                <Pause className="w-12 h-12 text-amber-400 mx-auto mb-2" />
                <h3 className="text-xl font-black text-white">Game Is Paused</h3>
                <p className="text-xs text-slate-400 mt-1 mb-4">
                  The game state, all bets, and chip stacks are safely saved in the database.
                </p>
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={handleTogglePause}
                    className="py-2 px-5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl shadow-lg active:scale-95 transition cursor-pointer flex items-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Resume Game</span>
                  </button>
                  <button
                    onClick={onLeaveToLobby}
                    className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Back to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Poker Felt Outer Rim */}
          <div className="w-full max-w-5xl flex-1 relative flex items-center justify-center min-h-[360px] max-h-[580px] my-auto">
            {/* Table Rim */}
            <div className="w-full h-full rounded-[140px] sm:rounded-[200px] table-rim p-3 sm:p-5 relative shadow-2xl">
              {/* Green Felt */}
              <div className="w-full h-full rounded-[120px] sm:rounded-[180px] poker-felt felt-ring relative flex items-center justify-center overflow-hidden">
                {/* Felt watermark logo */}
                <div className="absolute text-center opacity-10 pointer-events-none select-none">
                  <div className="text-6xl sm:text-8xl font-black tracking-widest text-emerald-100">
                    POKER
                  </div>
                  <div className="text-xs sm:text-sm font-bold tracking-widest text-emerald-200">
                    100 BB CASH TABLE
                  </div>
                </div>

                {/* Center Community Cards & Pot */}
                <div className="relative z-10 flex flex-col items-center">
                  {/* Pot Info */}
                  <div className="mb-3 flex flex-col items-center">
                    <div className="bg-slate-950/70 border border-amber-400/30 px-3 py-1 rounded-full shadow-lg flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
                        POT
                      </span>
                      <span className="font-mono font-black text-amber-300 text-sm sm:text-base">
                        {table.pot} chips
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(table.pot / table.bigBlind).toFixed(1)} BB)
                      </span>
                    </div>

                    {/* Side Pots display if multiple pots exist */}
                    {table.sidePots && table.sidePots.length > 1 && (
                      <div className="flex gap-1.5 mt-1">
                        {table.sidePots.map((p, idx) => (
                          <span
                            key={idx}
                            className="bg-slate-900/80 border border-slate-700 px-2 py-0.5 rounded text-[10px] font-mono text-slate-300"
                          >
                            {idx === 0 ? 'Main' : `Side ${idx}`}: {p.amount}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Community Cards */}
                  <div className="flex items-center gap-1.5 sm:gap-2 min-h-[64px]">
                    {table.communityCards && table.communityCards.length > 0 ? (
                      table.communityCards.map((card, idx) => {
                        const isWinCard = table.winningCards && table.winningCards.includes(card);
                        return (
                          <PlayingCard
                            key={idx}
                            card={card}
                            isWinning={isWinCard}
                            size="md"
                          />
                        );
                      })
                    ) : (
                      <div className="text-xs text-emerald-300/60 font-semibold tracking-wider uppercase px-4 py-2 border border-emerald-500/20 rounded-xl bg-emerald-950/30">
                        {table.lastActionText || 'Waiting for hand...'}
                      </div>
                    )}
                  </div>

                  {/* Showdown Winner Banner */}
                  {table.phase === 'showdown' && table.winners && table.winners.length > 0 && (
                    <div className="mt-3 bg-amber-500/20 border border-amber-400/60 px-4 py-1.5 rounded-xl shadow-xl text-center animate-deal">
                      <span className="text-xs font-bold text-amber-300 block">
                        🏆 {table.winners.map((w) => `${w.username} wins +${w.amount} (${w.handName})`).join(' & ')}
                      </span>
                    </div>
                  )}
                </div>

                {/* Player Seats Placed Radially */}
                {table.seats.map((seat) => {
                  const style = getSeatPositionStyle(seat.seatIndex);
                  const player = seat.player;
                  const isTurn = table.currentTurnSeat === seat.seatIndex;
                  const isDealer = table.dealerSeat === seat.seatIndex;

                  if (!player) {
                    // Empty seat
                    return (
                      <div
                        key={seat.seatIndex}
                        style={style}
                        className="absolute z-10 flex flex-col items-center"
                      >
                        <button
                          onClick={() => handleTakeSeat(seat.seatIndex)}
                          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-dashed border-emerald-400/40 hover:border-emerald-400 bg-slate-900/60 hover:bg-slate-900/90 text-emerald-400/70 hover:text-emerald-300 flex flex-col items-center justify-center transition active:scale-95 cursor-pointer shadow-lg group"
                          title="Take seat with 100 BB"
                        >
                          <PlusCircle className="w-5 h-5 group-hover:scale-110 transition" />
                          <span className="text-[9px] font-bold mt-0.5">Seat #{seat.seatIndex + 1}</span>
                        </button>
                      </div>
                    );
                  }

                  const isMe = player.userId === currentUser.id;

                  return (
                    <div
                      key={seat.seatIndex}
                      style={style}
                      className="absolute z-10 flex flex-col items-center"
                    >
                      {/* Player Box */}
                      <div
                        className={`relative rounded-xl p-2 sm:p-2.5 min-w-[100px] sm:min-w-[125px] text-center transition-all ${
                          isTurn
                            ? 'bg-slate-900 border-2 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.5)] scale-105'
                            : player.folded
                            ? 'bg-slate-950/60 border border-slate-800 opacity-60'
                            : 'bg-slate-900/90 border border-slate-700 shadow-xl'
                        }`}
                      >
                        {/* Dealer Button */}
                        {isDealer && (
                          <div
                            className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-full bg-white text-slate-950 font-black text-xs border-2 border-slate-900 flex items-center justify-center shadow-md select-none"
                            title="Dealer Button"
                          >
                            D
                          </div>
                        )}

                        {/* Avatar & Username */}
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <div
                            className="w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center uppercase"
                            style={{ backgroundColor: player.avatarColor || '#10b981' }}
                          >
                            {player.username[0]}
                          </div>
                          <span className="text-xs font-bold text-white truncate max-w-[70px]">
                            {player.username}
                          </span>
                        </div>

                        {/* Chip Stack */}
                        <div className="bg-slate-950/70 rounded-md py-0.5 px-1 font-mono text-xs font-bold text-emerald-400">
                          {player.chips}{' '}
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({(player.chips / table.bigBlind).toFixed(0)} BB)
                          </span>
                        </div>

                        {/* Last action / status badge */}
                        {player.lastAction && (
                          <div className="mt-1">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                                player.lastAction.includes('All-In')
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                                  : player.lastAction === 'Fold'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-emerald-500/20 text-emerald-400'
                              }`}
                            >
                              {player.lastAction}
                            </span>
                          </div>
                        )}

                        {/* Hand Result at Showdown */}
                        {player.handResult && (
                          <div className="mt-1 text-[9px] font-bold text-amber-300 truncate max-w-[100px] mx-auto">
                            {player.handResult}
                          </div>
                        )}
                      </div>

                      {/* Hole Cards */}
                      {player.hasCards && (
                        <div className="flex gap-1 -mt-2 z-20">
                          {player.holeCards.map((c, i) => (
                            <PlayingCard
                              key={i}
                              card={c}
                              size="sm"
                              isWinning={table.winningCards && table.winningCards.includes(c)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Current Street Bet on Felt */}
                      {player.currentBet > 0 && (
                        <div className="mt-1 bg-amber-400/90 text-slate-950 font-black text-[10px] font-mono px-2 py-0.5 rounded-full shadow-md animate-deal">
                          {player.currentBet}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Action Bar / Controls at Table Bottom */}
          <div className="w-full max-w-4xl bg-slate-900/95 border border-slate-800 rounded-2xl p-3 sm:p-4 backdrop-blur-md shadow-2xl z-20 shrink-0">
            {/* If player is not seated */}
            {!myPlayer && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-white">
                    You are spectating this table
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Click any open seat above or click "Take Available Seat" to buy in with 100 BB.
                  </p>
                </div>
                <button
                  onClick={() => handleTakeSeat(null)}
                  className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                >
                  Take Available Seat (100 BB)
                </button>
              </div>
            )}

            {/* If player is seated */}
            {myPlayer && (
              <div>
                {/* It is My Turn to Act */}
                {isMyTurn && table.legalActions ? (
                  <div className="flex flex-col gap-3">
                    {/* Raise controls if raising is allowed */}
                    {table.legalActions.canRaise && (
                      <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                        {/* Quick Presets */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setRaiseAmount(table.legalActions.minRaiseTotal)}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300"
                          >
                            Min
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRaiseAmount(
                                Math.min(
                                  table.legalActions.maxRaiseTotal,
                                  Math.max(
                                    table.legalActions.minRaiseTotal,
                                    Math.floor(table.pot * 0.5) + table.currentBet
                                  )
                                )
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300"
                          >
                            1/2 Pot
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setRaiseAmount(
                                Math.min(
                                  table.legalActions.maxRaiseTotal,
                                  Math.max(
                                    table.legalActions.minRaiseTotal,
                                    table.pot + table.currentBet
                                  )
                                )
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-300"
                          >
                            Pot
                          </button>
                          <button
                            type="button"
                            onClick={() => setRaiseAmount(table.legalActions.maxRaiseTotal)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-[11px] font-bold text-rose-300 border border-rose-500/40"
                          >
                            All-In
                          </button>
                        </div>

                        {/* Slider */}
                        <div className="flex-1 flex items-center gap-2 min-w-[140px]">
                          <input
                            type="range"
                            min={table.legalActions.minRaiseTotal}
                            max={table.legalActions.maxRaiseTotal}
                            step={table.bigBlind}
                            value={raiseAmount}
                            onChange={(e) => setRaiseAmount(Number(e.target.value))}
                            className="w-full accent-emerald-500 cursor-pointer"
                          />
                          <input
                            type="number"
                            min={table.legalActions.minRaiseTotal}
                            max={table.legalActions.maxRaiseTotal}
                            value={raiseAmount}
                            onChange={(e) =>
                              setRaiseAmount(
                                Math.min(
                                  table.legalActions.maxRaiseTotal,
                                  Math.max(table.legalActions.minRaiseTotal, Number(e.target.value))
                                )
                              )
                            }
                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white font-mono text-center"
                          />
                        </div>
                      </div>
                    )}

                    {/* Main Action Buttons */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      {/* Fold */}
                      <button
                        onClick={() => handleAction('fold')}
                        className="py-3 px-3 rounded-xl bg-slate-800 hover:bg-rose-600 hover:text-white text-slate-300 font-extrabold text-xs sm:text-sm border border-slate-700 hover:border-rose-500 transition active:scale-95 cursor-pointer shadow-md"
                      >
                        Fold
                      </button>

                      {/* Check or Call */}
                      {table.legalActions.canCheck ? (
                        <button
                          onClick={() => handleAction('check')}
                          className="py-3 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs sm:text-sm shadow-lg shadow-blue-600/20 active:scale-95 transition cursor-pointer"
                        >
                          Check
                        </button>
                      ) : (
                        <button
                          onClick={() => handleAction('call')}
                          className="py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                        >
                          Call {table.legalActions.callAmount}
                        </button>
                      )}

                      {/* Raise / Bet */}
                      {table.legalActions.canRaise ? (
                        <button
                          onClick={() => handleAction('raise', raiseAmount)}
                          className="py-3 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer"
                        >
                          {raiseAmount >= table.legalActions.maxRaiseTotal
                            ? `All-In (${raiseAmount})`
                            : table.currentBet === 0
                            ? `Bet ${raiseAmount}`
                            : `Raise to ${raiseAmount}`}
                        </button>
                      ) : (
                        <button
                          disabled
                          className="py-3 px-3 rounded-xl bg-slate-800 text-slate-600 font-bold text-xs cursor-not-allowed"
                        >
                          Cannot Raise
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Waiting for turn or between hands */
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-slate-400">
                      {['preflop', 'flop', 'turn', 'river'].includes(table.phase) ? (
                        <span>Waiting for action from current player...</span>
                      ) : (
                        <span>Hand completed. Waiting for next deal...</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Deal Cards / Start Hand button */}
                      {table.canStartHand && (
                        <button
                          onClick={handleStartHand}
                          className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>Deal Cards</span>
                        </button>
                      )}

                      {/* Show My Cards button */}
                      {table.canShowCards && (
                        <button
                          onClick={handleShowCards}
                          className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
                          title="Show your cards to the table"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Show Cards</span>
                        </button>
                      )}

                      {/* Sit out toggle */}
                      <button
                        onClick={handleToggleSitOut}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                          myPlayer.isSittingOut
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-slate-800 border-slate-700 text-slate-300'
                        }`}
                      >
                        {myPlayer.isSittingOut ? 'I am Back' : 'Sit Out'}
                      </button>

                      {/* Stand up & cash out */}
                      <button
                        onClick={handleStandUp}
                        className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-bold transition cursor-pointer"
                        title="Stand up and cash out your chips"
                      >
                        Stand Up
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Drawer: Live Chat & Dealer Log */}
        <div className="w-72 sm:w-80 border-l border-slate-800 bg-slate-900/95 flex flex-col shrink-0 hidden md:flex">
          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveSidePanel('chat')}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeSidePanel === 'chat'
                  ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Table Chat</span>
            </button>
            <button
              onClick={() => {
                setActiveSidePanel('history');
                fetchHistory();
              }}
              className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeSidePanel === 'history'
                  ? 'text-emerald-400 border-b-2 border-emerald-400 bg-slate-800/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Hand History</span>
            </button>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {activeSidePanel === 'chat' && (
              <>
                {/* Action Log messages */}
                {table.actionLog &&
                  table.actionLog.map((log) => (
                    <div key={log.id} className="text-slate-400 font-mono text-[11px] leading-relaxed">
                      <span className="text-slate-600">[{log.time ? new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}]</span>{' '}
                      {log.text}
                    </div>
                  ))}

                {/* Player Chat messages */}
                {chatMessages.map((msg) => (
                  <div key={msg.id} className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/40">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                      <span className="font-bold text-white capitalize">{msg.username}</span>
                      <span>{msg.time}</span>
                    </div>
                    <p className="text-slate-200">{msg.message}</p>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </>
            )}

            {activeSidePanel === 'history' && (
              <div className="space-y-3">
                {handHistory.length === 0 ? (
                  <p className="text-slate-500 text-center py-4">No completed hands yet.</p>
                ) : (
                  handHistory.map((h) => (
                    <div key={h.id} className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-xl">
                      <div className="flex justify-between items-center mb-1 text-[11px]">
                        <span className="font-bold text-emerald-400">Hand #{h.hand_number}</span>
                        <span className="text-amber-400 font-mono font-bold">Pot: {h.pot_total}</span>
                      </div>
                      <div className="flex gap-1 my-1.5">
                        {(h.community_cards || []).map((c, i) => (
                          <PlayingCard key={i} card={c} size="sm" />
                        ))}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        Winner: <strong className="text-white">{(h.winners || []).map((w) => `${w.username} (+${w.amount})`).join(', ')}</strong>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Chat Input */}
          {activeSidePanel === 'chat' && (
            <form onSubmit={handleSendChat} className="p-2 border-t border-slate-800 flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Message friends..."
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg transition cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Modal: Top-Up Chips (Capped at 100 BB) */}
      {showTopUpModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-deal">
            <h3 className="text-lg font-bold text-white mb-1">Get More Chips</h3>
            <p className="text-xs text-slate-400 mb-4">
              Top up your chip stack up to the <strong>100 BB cap</strong> ({cap} chips).
            </p>

            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Stack:</span>
                <span className="font-mono font-bold text-white">
                  {myPlayer?.chips || 0} chips
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">100 BB Cap:</span>
                <span className="font-mono font-bold text-amber-400">
                  {cap} chips
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-800 pt-1">
                <span className="text-slate-300 font-bold">Max Top-up Available:</span>
                <span className="font-mono font-bold text-emerald-400">
                  +{Math.max(0, cap - (myPlayer?.chips || 0))} chips
                </span>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Chips to Add
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, cap - (myPlayer?.chips || 0))}
                  value={topUpAmount}
                  onChange={(e) =>
                    setTopUpAmount(
                      Math.min(
                        Math.max(0, cap - (myPlayer?.chips || 0)),
                        Math.max(1, parseInt(e.target.value) || 1)
                      )
                    )
                  }
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setTopUpAmount(Math.max(0, cap - (myPlayer?.chips || 0)))}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold"
                >
                  Max (100 BB)
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTopUpModal(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTopUp}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition cursor-pointer shadow-md"
              >
                Confirm Top-Up
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Table Settings */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-deal">
            <h3 className="text-lg font-bold text-white mb-1">Edit Table Settings</h3>
            <p className="text-xs text-slate-400 mb-4">
              Edit blinds or pause the table. The game stays safely stored in the database.
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Small Blind
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editSmallBlind}
                    onChange={(e) => setEditSmallBlind(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Big Blind
                  </label>
                  <input
                    type="number"
                    min={editSmallBlind}
                    value={editBigBlind}
                    onChange={(e) => setEditBigBlind(Math.max(editSmallBlind, parseInt(e.target.value) || editSmallBlind))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Pause Table</span>
                <input
                  type="checkbox"
                  checked={editIsPaused}
                  onChange={(e) => setEditIsPaused(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

