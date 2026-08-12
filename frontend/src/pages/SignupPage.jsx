import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { registerCustomer } from '../api/auth.js'

export function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', first_name: '', last_name: '', password: '', confirmPassword: '' })
  const [validationError, setValidationError] = useState('')
  const signupMutation = useMutation({ mutationFn: registerCustomer, onSuccess: () => navigate('/', { replace: true }) })

  function update(event) {
    setValidationError('')
    setForm({...form, [event.target.name]: event.target.value})
  }

  function submit(event) {
    event.preventDefault()
    if (form.password.length < 8) return setValidationError('Password must contain at least 8 characters.')
    if (form.password !== form.confirmPassword) return setValidationError('Passwords do not match.')
    const { confirmPassword, ...payload } = form
    void confirmPassword
    signupMutation.mutate(payload)
  }

  const apiErrors = signupMutation.error?.response?.data
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4.5rem)] max-w-6xl items-center gap-12 px-5 py-12 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
      <section>
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500"><ArrowLeft size={17} /> Back to search</Link>
        <UserPlus className="mt-12 text-moss" />
        <p className="mt-5 text-xs font-bold tracking-[0.16em] text-signal uppercase">Customer account</p>
        <h1 className="mt-3 font-display text-5xl leading-tight">Book your next seat.</h1>
        <p className="mt-4 leading-7 text-stone-500">Accounts created here always receive the customer role. Operators are created by an administrator.</p>
      </section>
      <form onSubmit={submit} className="grid gap-6 border-y border-stone-300 py-9 sm:grid-cols-2">
        <SignupField label="First name" name="first_name" value={form.first_name} onChange={update} />
        <SignupField label="Last name" name="last_name" value={form.last_name} onChange={update} />
        <SignupField label="Username" name="username" value={form.username} onChange={update} required />
        <SignupField label="Email" name="email" type="email" value={form.email} onChange={update} required />
        <SignupField label="Password" name="password" type="password" value={form.password} onChange={update} required />
        <SignupField label="Confirm password" name="confirmPassword" type="password" value={form.confirmPassword} onChange={update} required />
        {(validationError || apiErrors) && <p className="text-sm font-semibold text-red-700 sm:col-span-2" role="alert">{validationError || Object.values(apiErrors).flat().join(' ')}</p>}
        <button disabled={signupMutation.isPending} className="rounded-full bg-signal px-6 py-3.5 font-bold text-white sm:col-span-2">{signupMutation.isPending ? 'Creating account…' : 'Create account'}</button>
        <p className="text-center text-sm text-stone-500 sm:col-span-2">Already registered? <Link to="/login" className="font-bold text-signal">Sign in</Link></p>
      </form>
    </main>
  )
}

function SignupField({ label, ...inputProps }) {
  return <label><span className="text-xs font-bold tracking-wider text-stone-500 uppercase">{label}</span><input {...inputProps} autoComplete={inputProps.name} className="field-input" /></label>
}
