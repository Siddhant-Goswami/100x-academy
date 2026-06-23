import { useEffect, useState, type ReactNode } from 'react';
import { supabase, hasSupabase } from '../lib/supabase';
import { signInWithEmail, signUpWithEmail, signOut } from '../lib/auth';
import type { Session } from '@supabase/supabase-js';

// Wraps any authenticated UI. Renders a minimal email/password form until a
// session exists, then renders children with the session.
export default function AuthGate({ children }: { children: (s: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabase) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const res =
      mode === 'in'
        ? await signInWithEmail(email, password)
        : await signUpWithEmail(email, password, name);
    if (res.error) setErr(res.error.message);
  }

  if (!hasSupabase) return <p>Supabase is not configured for this deployment.</p>;
  if (!ready) return <p>Loading...</p>;

  if (!session) {
    return (
      <form className="auth-form" onSubmit={submit} style={{ maxWidth: 360 }}>
        <h2>{mode === 'in' ? 'Sign in' : 'Create account'}</h2>
        {mode === 'up' && (
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p style={{ color: '#dc2626' }}>{err}</p>}
        <button type="submit" className="ex-btn ex-btn-primary">
          {mode === 'in' ? 'Sign in' : 'Sign up'}
        </button>
        <button
          type="button"
          className="ex-btn ex-btn-ghost"
          onClick={() => setMode(mode === 'in' ? 'up' : 'in')}
        >
          {mode === 'in' ? 'Need an account?' : 'Have an account?'}
        </button>
      </form>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button type="button" className="ex-btn ex-btn-ghost" onClick={() => signOut()}>
          Sign out
        </button>
      </div>
      {children(session)}
    </div>
  );
}
