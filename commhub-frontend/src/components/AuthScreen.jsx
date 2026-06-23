import React, { useState } from 'react';
import { Loader2, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import api from '../lib/api';

export default function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      const payload  = mode === 'login' ? { email, password: pw } : { name, email, password: pw };
      const { data } = await api.post(endpoint, payload);
      localStorage.setItem('commhub_token', data.token);
      onAuth(data.user);
    } catch (e) {
      setErr(e.response?.data?.error || 'Something went wrong. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen w-full place-items-center bg-slate-900" style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div className="w-full max-w-sm px-6">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 text-xl font-bold text-white shadow-lg shadow-teal-900/40">CH</div>
          <h1 className="mt-4 text-2xl font-bold text-white">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-slate-400">{mode === 'login' ? "Sign in to your team's CommHub" : 'Join your team on CommHub'}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-2xl">
          <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
            {['login','signup'].map(m => (
              <button key={m} onClick={() => { setMode(m); setErr(''); }} className={`flex-1 rounded-md py-1.5 text-sm font-semibold transition ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                {m === 'login' ? 'Log in' : 'Sign up'}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {mode === 'signup' && (
              <Field label="Full name"><input value={name} onChange={e=>setName(e.target.value)} placeholder="Alex Rivera" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" /></Field>
            )}
            <Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" /></Field>
            <Field label="Password">
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="••••••••" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-10 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
                <button onClick={()=>setShowPw(s=>!s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{showPw ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
              </div>
            </Field>
            {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{err}</p>}
            <button onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-700 disabled:opacity-60">
              {busy && <Loader2 className="animate-spin" size={16}/>}
              {mode === 'login' ? 'Log in' : 'Create account'}
            </button>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-1.5 px-1 text-[11px] leading-relaxed text-slate-500">
          <ShieldAlert size={13} className="mt-0.5 shrink-0"/>
          Passwords are hashed with bcrypt on the server. Sessions last 30 days.
        </p>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
