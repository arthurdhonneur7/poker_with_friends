import { io } from 'socket.io-client';

const API_BASE = '/api';

export function getStoredToken() {
  return localStorage.getItem('poker_token') || null;
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem('poker_token', token);
  } else {
    localStorage.removeItem('poker_token');
  }
}

export async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, config);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Socket singleton
let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(window.location.origin, {
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });

    const token = getStoredToken();
    if (token) {
      socketInstance.emit('auth', token);
    }
  }
  return socketInstance;
}

