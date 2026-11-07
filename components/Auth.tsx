'use client';

import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import VintageBox from './art/VintageBox';

export default function Auth({ onSignedIn }: { onSignedIn: (user: { id: string; username: string }) => void }) {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await api<{ user: { id: string; username: string } }>('/api/auth', { json: { action: mode, username, password } });
      onSignedIn(result.user);
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="auth">
      <section className="auth-side">
        <a className="brand" href="/">ClauseBridge</a>
        <div>
          <h1>Every promise in your contracts, tracked to the clause.</h1>
          <p>Upload a contract and confirm the deadlines, deliverables, parties and payments it contains. ClauseBridge keeps owners, evidence and payment schedules beside the exact contract text.</p>
        </div>
        <VintageBox id="auth-box" className="auth-box" />
        <p className="legal" style={{ color: '#EAD6B6' }}>Supports contract administration. It does not replace legal review or give legal advice.</p>
      </section>
      <form className="auth-form torn" onSubmit={submit}>
        <h2>{mode === 'register' ? 'Create an account' : 'Sign in'}</h2>
        <p className="hint" style={{ margin: 0 }}>{mode === 'register' ? 'You get your own workspace. Invite teammates from it later.' : 'Welcome back.'}</p>
        <label className="field">Username<input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_\-]{3,32}" /></label>
        <label className="field">Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={12} maxLength={128} /></label>
        {mode === 'register' && <span className="hint">At least 12 characters.</span>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy} type="submit">{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
        <button className="btn quiet" type="button" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}>
          {mode === 'register' ? 'I already have an account' : 'Create a new account'}
        </button>
      </form>
    </div>
  );
}
