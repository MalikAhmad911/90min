'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Login failed')
        return
      }
      const params = new URLSearchParams(window.location.search)
      const next = params.get('next') || '/admin/streams'
      // Full navigation (not a soft router.push) so a stale client-router
      // cache can never resolve the target to a 404.
      window.location.assign(next)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center px-4 py-20">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-bg-surface border border-divider rounded-xl p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-accent-green" />
          <h1 className="text-base font-semibold text-content-primary">Admin sign in</h1>
        </div>

        <label className="flex flex-col gap-1 text-[13px] text-content-secondary">
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="bg-bg-elevated text-content-primary rounded-lg px-3 py-2 text-sm border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green"
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-[13px] text-content-secondary">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="bg-bg-elevated text-content-primary rounded-lg px-3 py-2 text-sm border border-divider focus:outline-none focus:ring-1 focus:ring-accent-green"
            required
          />
        </label>

        {error && <p className="text-[13px] text-live-red">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-accent-green text-bg-primary font-semibold rounded-lg py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
