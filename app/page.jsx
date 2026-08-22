'use client';

import { useState } from 'react';

export default function Home() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function requestLink(e) {
    e.preventDefault();
    if (!email || busy) return;
    setBusy(true);
    await fetch('/api/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    setSent(true);
  }

  return (
    <main className="wrap" style={{ maxWidth: 560, paddingTop: 60 }}>
      <h1 className="display" style={{ fontSize: 48, marginBottom: 6 }}>M2OM PROOFING</h1>
      <p className="mb" style={{ fontWeight: 700 }}>
        Review proofs, comment directly on your artwork, and approve final designs.
      </p>
      <div className="card">
        {sent ? (
          <>
            <h2 className="display">CHECK YOUR EMAIL</h2>
            <p className="mt">
              If we have active design projects under that email, a fresh portal link is on its
              way. Links are good for 30 days.
            </p>
          </>
        ) : (
          <form onSubmit={requestLink}>
            <label className="label" htmlFor="email">Your email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@yourbrand.com"
              required
            />
            <button className="btn yl mt" type="submit" disabled={busy}>
              {busy ? 'SENDING...' : 'EMAIL ME MY PORTAL LINK'}
            </button>
          </form>
        )}
      </div>
      <p className="small">
        Need help? Call 1-888-207-8731, text 614-353-2369, or email design@made2ordermerch.com.
      </p>
    </main>
  );
}
