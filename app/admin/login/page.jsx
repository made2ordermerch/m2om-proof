'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) router.push('/admin');
    else setError('Wrong password.');
  }

  return (
    <main className="wrap" style={{ maxWidth: 480, paddingTop: 80 }}>
      <h1 className="display" style={{ fontSize: 40 }}>ADMIN LOGIN</h1>
      <div className="card mt">
        <form onSubmit={login}>
          <label className="label" htmlFor="pw">Password</label>
          <input
            id="pw"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="mt" style={{ fontWeight: 800 }}>{error}</p>}
          <button className="btn yl mt" type="submit" disabled={busy}>
            {busy ? 'CHECKING...' : 'LOG IN'}
          </button>
        </form>
      </div>
    </main>
  );
}
