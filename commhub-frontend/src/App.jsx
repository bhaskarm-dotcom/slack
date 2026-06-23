import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import api from './lib/api';
import { connect, disconnect } from './lib/socket';
import AuthScreen from './components/AuthScreen';
import ChatApp from './components/ChatApp';

export default function App() {
  const [phase, setPhase] = useState('loading'); // loading | auth | app
  const [me, setMe] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('commhub_token');
    if (!token) { setPhase('auth'); return; }
    api.get('/api/auth/me')
      .then(({ data }) => { setMe(data); connect(token); setPhase('app'); })
      .catch(() => { localStorage.removeItem('commhub_token'); setPhase('auth'); });
  }, []);

  const onAuth = (user) => {
    const token = localStorage.getItem('commhub_token');
    setMe(user);
    connect(token);
    setPhase('app');
  };

  const onLogout = async () => {
    try { await api.patch('/api/users/me/presence', { presence: 'offline' }); } catch {}
    disconnect();
    localStorage.removeItem('commhub_token');
    setMe(null);
    setPhase('auth');
  };

  if (phase === 'loading')
    return (
      <div className="grid h-screen w-full place-items-center bg-white">
        <div className="flex items-center gap-2 text-slate-400"><Loader2 className="animate-spin" size={20}/> Loading…</div>
      </div>
    );
  if (phase === 'auth') return <AuthScreen onAuth={onAuth} />;
  return <ChatApp me={me} onLogout={onLogout} />;
}
