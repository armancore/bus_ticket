import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, LockKeyhole } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { login } from '../api/auth.js'
import { clearTokens } from '../api/client.js'

export function LoginPage() {
  const [form, setForm] = useState({ username: 'demo_customer', password: 'Customer@12345' })
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const requestedNext = searchParams.get('next') || '/'
  const safeNext = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/'

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      if (user.role !== 'CUSTOMER') {
        clearTokens()
        return
      }
      navigate(safeNext, { replace: true })
    },
  })

  function handleSubmit(event) {
    event.preventDefault()
    loginMutation.mutate(form)
  }

  const roleError = loginMutation.data && loginMutation.data.role !== 'CUSTOMER'
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-2">
      <section>
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink"><ArrowLeft size={17} /> Back to search</Link>
        <p className="mt-12 text-xs font-bold tracking-[0.16em] text-signal uppercase">Customer sign in</p>
        <h1 className="mt-3 max-w-lg font-display text-5xl leading-tight sm:text-6xl">Keep your seats within reach.</h1>
        <p className="mt-5 max-w-md leading-7 text-stone-500">Sign in before placing a 10-minute hold. Your selected seats will still be waiting on the trip page.</p>
      </section>

      <form onSubmit={handleSubmit} className="border-y border-stone-300 py-9">
        <LockKeyhole className="text-moss" aria-hidden="true" />
        <h2 className="mt-4 font-display text-3xl">Welcome back</h2>
        <label className="mt-8 block">
          <span className="text-xs font-bold tracking-wider text-stone-500 uppercase">Username</span>
          <input value={form.username} onChange={(event) => setForm({...form, username: event.target.value})} autoComplete="username" required className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 text-lg outline-none focus:border-signal" />
        </label>
        <label className="mt-6 block">
          <span className="text-xs font-bold tracking-wider text-stone-500 uppercase">Password</span>
          <input type="password" value={form.password} onChange={(event) => setForm({...form, password: event.target.value})} autoComplete="current-password" required className="mt-2 w-full border-b border-stone-300 bg-transparent py-3 text-lg outline-none focus:border-signal" />
        </label>
        {(loginMutation.isError || roleError) && <p className="mt-5 text-sm font-semibold text-red-700" role="alert">{roleError ? 'Use a customer account for booking.' : 'The username or password is incorrect.'}</p>}
        <button disabled={loginMutation.isPending} className="mt-8 w-full rounded-full bg-ink px-6 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">
          {loginMutation.isPending ? 'Signing in…' : 'Sign in and continue'}
        </button>
        <p className="mt-5 text-center text-xs text-stone-400">Demo login is filled in for local development.</p>
      </form>
    </main>
  )
}
