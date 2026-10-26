import React, { useState, useEffect } from 'react';
import AuthScreen from './components/AuthScreen';
import LobbyScreen from './components/LobbyScreen';
import PokerTable from './components/PokerTable';
import { apiRequest, getStoredToken, setStoredToken, getSocket } from './api';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeGameId, setActiveGameId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const token = getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const data = await apiRequest('/auth/me');
        setCurrentUser(data.user);
        getSocket().emit('auth', token);
      } catch (err) {
        console.error('Session restoration failed:', err);
        setStoredToken(null);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, []);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    setStoredToken(null);
    setCurrentUser(null);
    setActiveGameId(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-xs text-slate-400 font-mono tracking-widest uppercase">
          Initializing Poker With Friends...
        </p>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
  }

  if (activeGameId) {
    return (
      <PokerTable
        gameId={activeGameId}
        currentUser={currentUser}
        onLeaveToLobby={() => setActiveGameId(null)}
      />
    );
  }

  return (
    <LobbyScreen
      currentUser={currentUser}
      onSelectGame={(id) => setActiveGameId(id)}
      onLogout={handleLogout}
    />
  );
}

