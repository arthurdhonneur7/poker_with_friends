import React, { useState } from 'react';
import { apiRequest, setStoredToken, getSocket } from '../api';
import { Spade, Users, KeyRound, User, ArrowRight, ShieldCheck } from 'lucide-react';

export default function AuthScreen({ onLoginSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const quickUsers = [
    { name: 'arthur', label: 'Arthur', color: 'from-emerald-500 to-teal-700' },
    { name: 'matteo', label: 'Matteo', color: 'from-blue-500 to-indigo-700' },
    { name: 'cyprien', label: 'Cyprien', color: 'from-amber-500 to-orange-700' },
  ];

  const handleQuickLogin = async (user) => {
    setError('');
    setLoading(true);
    try {
      const data = await apiRequest('/auth/login', 'POST', {
        username: user.name,
        password: '1234',
      });
      setStoredToken(data.token);
      getSocket().emit('auth', data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Quick login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const data = await apiRequest(endpoint, 'POST', { username, password });
      setStoredToken(data.token);
      getSocket().emit('auth', data.token);
      onLoginSuccess(data.user);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background poker glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md p-6 sm:p-8 z-10">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20 mb-3">
            <Spade className="w-9 h-9" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Poker With Friends
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            No-Limit Texas Hold'em Cash Games (100 BB)
          </p>
        </div>

        {/* Quick 1-Click Login for Friends */}
        <div className="mb-6 bg-slate-800/50 p-4 rounded-xl border border-slate-700/60">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Quick Login</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {quickUsers.map((u) => (
              <button
                key={u.name}
                type="button"
                disabled={loading}
                onClick={() => handleQuickLogin(u)}
                className={`py-2 px-3 rounded-lg text-xs font-bold text-white bg-gradient-to-r ${u.color} hover:brightness-110 active:scale-95 transition-all shadow-sm flex flex-col items-center justify-center gap-1 cursor-pointer`}
              >
                <span>{u.label}</span>
                <span className="text-[10px] text-white/70 font-mono">1234</span>
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex py-2 items-center mb-4">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-xs uppercase tracking-wider text-slate-500">
            or enter account
          </span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Username
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. arthur"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-slate-800/80 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-lg text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 active:scale-[0.98] transition cursor-pointer disabled:opacity-50"
          >
            <span>{isRegister ? 'Create Account' : 'Log In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-slate-400 hover:text-emerald-400 transition cursor-pointer"
          >
            {isRegister
              ? 'Already have an account? Log in'
              : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}

