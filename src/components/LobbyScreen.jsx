import React, { useState, useEffect } from 'react';
import { apiRequest, getSocket } from '../api';
import {
  Spade,
  Plus,
  Play,
  Pause,
  Settings,
  Users,
  Coins,
  Trophy,
  LogOut,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export default function LobbyScreen({ currentUser, onSelectGame, onLogout }) {
  const [games, setGames] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(null);
  const [activeTab, setActiveTab] = useState('games'); // 'games' | 'leaderboard'

  // Create game form state
  const [newGameName, setNewGameName] = useState('');
  const [newGameSmallBlind, setNewGameSmallBlind] = useState(1);
  const [newGameBigBlind, setNewGameBigBlind] = useState(2);
  const [newGameMaxPlayers, setNewGameMaxPlayers] = useState(8);

  // Edit game form state
  const [editName, setEditName] = useState('');
  const [editSmallBlind, setEditSmallBlind] = useState(1);
  const [editBigBlind, setEditBigBlind] = useState(2);
  const [editMaxPlayers, setEditMaxPlayers] = useState(8);
  const [editIsPaused, setEditIsPaused] = useState(false);

  const fetchGames = async () => {
    try {
      const data = await apiRequest('/games');
      setGames(data.games || []);
    } catch (err) {
      console.error('Failed to load games:', err);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await apiRequest('/leaderboard');
      setLeaderboard(data.players || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchGames(), fetchLeaderboard()]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();

    const socket = getSocket();
    const handleLobbyUpdate = () => {
      fetchGames();
    };

    socket.on('lobby_update', handleLobbyUpdate);
    return () => {
      socket.off('lobby_update', handleLobbyUpdate);
    };
  }, []);

  const handleCreateGame = async (e) => {
    e.preventDefault();
    try {
      const res = await apiRequest('/games', 'POST', {
        name: newGameName || `${currentUser.username}'s Cash Game`,
        smallBlind: newGameSmallBlind,
        bigBlind: newGameBigBlind,
        maxPlayers: newGameMaxPlayers,
      });
      setShowCreateModal(false);
      await fetchGames();
      if (res.id) {
        onSelectGame(res.id);
      }
    } catch (err) {
      alert(err.message || 'Failed to create game');
    }
  };

  const openEditModal = (game) => {
    setShowEditModal(game);
    setEditName(game.name);
    setEditSmallBlind(game.smallBlind);
    setEditBigBlind(game.bigBlind);
    setEditMaxPlayers(game.maxPlayers);
    setEditIsPaused(game.isPaused);
  };

  const handleSaveEditGame = async (e) => {
    e.preventDefault();
    if (!showEditModal) return;
    try {
      await apiRequest(`/games/${showEditModal.id}`, 'PATCH', {
        name: editName,
        smallBlind: editSmallBlind,
        bigBlind: editBigBlind,
        maxPlayers: editMaxPlayers,
        isPaused: editIsPaused,
      });
      setShowEditModal(null);
      await fetchGames();
    } catch (err) {
      alert(err.message || 'Failed to update game');
    }
  };

  const handleTogglePause = async (game, e) => {
    e.stopPropagation();
    try {
      await apiRequest(`/games/${game.id}`, 'PATCH', {
        isPaused: !game.isPaused,
      });
      await fetchGames();
    } catch (err) {
      alert(err.message || 'Failed to toggle pause');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 flex items-center justify-center font-black shadow-md shadow-emerald-500/10">
            <Spade className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg text-white leading-tight">
              Poker With Friends
            </h1>
            <p className="text-xs text-slate-400">Cash Game Lobby (100 BB Capped)</p>
          </div>
        </div>

        {/* User bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white uppercase shadow-sm"
              style={{ backgroundColor: currentUser.avatarColor || '#10b981' }}
            >
              {currentUser.username[0]}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-bold text-white capitalize">
                {currentUser.username}
              </div>
              <div className="text-[11px] text-emerald-400 font-mono">
                {currentUser.netProfit >= 0 ? `+${currentUser.netProfit}` : currentUser.netProfit} chips
              </div>
            </div>
          </div>

          <button
            onClick={onLogout}
            title="Log Out"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* Controls & Tabs */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('games')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'games'
                  ? 'bg-emerald-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Coins className="w-4 h-4" />
              <span>Cash Tables ({games.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('leaderboard')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-emerald-600 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Leaderboard</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              onClick={loadData}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex-1 sm:flex-initial py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-95 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Cash Game</span>
            </button>
          </div>
        </div>

        {/* Tab: Cash Tables */}
        {activeTab === 'games' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {games.map((g) => {
              const cap = g.maxBuyIn || g.bigBlind * 100;
              return (
                <div
                  key={g.id}
                  className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition flex flex-col justify-between relative group shadow-lg"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-bold text-white text-base group-hover:text-emerald-400 transition">
                        {g.name}
                      </h3>
                      {g.isPaused ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Paused
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-400 mb-4">
                      Hosted by <span className="text-slate-300 font-medium">{g.creatorUsername}</span>
                    </p>

                    {/* Table Specifications */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60 text-xs mb-4">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">
                          Blinds
                        </span>
                        <span className="font-mono font-bold text-white">
                          {g.smallBlind} / {g.bigBlind}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">
                          100 BB Cap
                        </span>
                        <span className="font-mono font-bold text-amber-400">
                          {cap} chips
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">
                          Players
                        </span>
                        <span className="font-mono font-bold text-slate-300 flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {g.seatedPlayersCount} / {g.maxPlayers}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold block">
                          Hand #
                        </span>
                        <span className="font-mono font-bold text-slate-400">
                          {g.handNumber}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => onSelectGame(g.id)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 active:scale-95 transition cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{g.isPaused ? 'Enter Table' : 'Play / Join'}</span>
                    </button>

                    <button
                      onClick={(e) => handleTogglePause(g, e)}
                      title={g.isPaused ? 'Resume Game' : 'Pause Game'}
                      className={`p-2 rounded-xl border text-xs font-bold transition cursor-pointer ${
                        g.isPaused
                          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20'
                          : 'border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                      }`}
                    >
                      {g.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => openEditModal(g)}
                      title="Edit Table Settings"
                      className="p-2 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:text-white hover:border-slate-600 transition cursor-pointer"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab: Leaderboard */}
        {activeTab === 'leaderboard' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">Friends Leaderboard</h3>
                <p className="text-xs text-slate-400">Career stats across all NLH cash games</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Rank</th>
                    <th className="py-3 px-4">Player</th>
                    <th className="py-3 px-4">Hands Played</th>
                    <th className="py-3 px-4">Hands Won</th>
                    <th className="py-3 px-4 text-right">Net Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {leaderboard.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-400">
                        #{idx + 1}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-white uppercase text-[10px]"
                            style={{ backgroundColor: p.avatar_color || '#10b981' }}
                          >
                            {p.username[0]}
                          </div>
                          <span className="font-bold text-white capitalize">
                            {p.username}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {p.hands_played}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {p.hands_won}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-right">
                        <span
                          className={
                            p.net_profit > 0
                              ? 'text-emerald-400'
                              : p.net_profit < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                          }
                        >
                          {p.net_profit > 0 ? `+${p.net_profit}` : p.net_profit} chips
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal: Create Cash Game */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-deal">
            <h3 className="text-lg font-bold text-white mb-1">Create Cash Game</h3>
            <p className="text-xs text-slate-400 mb-4">
              Set up a No-Limit Texas Hold'em table with automatic 100 BB cap
            </p>

            <form onSubmit={handleCreateGame} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Table Name
                </label>
                <input
                  type="text"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  placeholder="e.g. Arthur's Friday Game"
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
                    value={newGameSmallBlind}
                    onChange={(e) => setNewGameSmallBlind(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Big Blind
                  </label>
                  <input
                    type="number"
                    min={newGameSmallBlind}
                    value={newGameBigBlind}
                    onChange={(e) => setNewGameBigBlind(Math.max(newGameSmallBlind, parseInt(e.target.value) || newGameSmallBlind))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 flex justify-between items-center">
                <span>100 BB Buy-in & Top-up Cap:</span>
                <span className="font-mono font-bold text-amber-400">
                  {newGameBigBlind * 100} chips
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Max Players (2 - 9)
                </label>
                <select
                  value={newGameMaxPlayers}
                  onChange={(e) => setNewGameMaxPlayers(parseInt(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value={2}>2 Players (Heads-Up)</option>
                  <option value={6}>6 Players (6-Max)</option>
                  <option value={8}>8 Players</option>
                  <option value={9}>9 Players (Full Ring)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition cursor-pointer"
                >
                  Create & Join
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Cash Game */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-deal">
            <h3 className="text-lg font-bold text-white mb-1">Edit Table Settings</h3>
            <p className="text-xs text-slate-400 mb-4">
              Edit table name, blinds, or pause state. All player stacks are preserved.
            </p>

            <form onSubmit={handleSaveEditGame} className="space-y-4">
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs font-semibold text-slate-300">Pause Game</span>
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
                  onClick={() => setShowEditModal(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

