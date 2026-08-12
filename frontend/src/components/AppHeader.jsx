import { BusFront, LogOut, UserRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { logout } from '../api/auth.js'
import { getStoredUser } from '../api/client.js'

const DASHBOARD_PATHS = {
  CUSTOMER: '/',
  OPERATOR: '/operator',
  ADMIN: '/admin-dashboard',
}

export function AppHeader() {
  const [user, setUser] = useState(getStoredUser())
  const navigate = useNavigate()

  useEffect(() => {
    const updateAuthState = () => setUser(getStoredUser())
    window.addEventListener('auth:changed', updateAuthState)
    window.addEventListener('auth:expired', updateAuthState)
    return () => {
      window.removeEventListener('auth:changed', updateAuthState)
      window.removeEventListener('auth:expired', updateAuthState)
    }
  }, [])

  function handleLogout() {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <header className="border-b border-stone-200/80 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Sajilo Bus home">
          <span className="grid size-10 place-items-center rounded-full bg-ink text-white">
            <BusFront size={19} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-xl leading-none">Sajilo Bus</span>
            <span className="mt-1 block text-[10px] font-bold tracking-[0.18em] text-stone-500 uppercase">Travel Nepal</span>
          </span>
        </Link>

        <nav className="flex items-center gap-5" aria-label="Account">
          {user ? (
            <>
              <Link to={DASHBOARD_PATHS[user.role] || '/'} className="flex items-center gap-2 text-sm font-semibold text-stone-600 hover:text-ink">
                <UserRound size={18} aria-hidden="true" />
                <span className="hidden sm:inline">{user.role === 'CUSTOMER' ? user.username : `${user.role.charAt(0)}${user.role.slice(1).toLowerCase()} dashboard`}</span>
              </Link>
              <button type="button" onClick={handleLogout} className="flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-red-700">
                <LogOut size={17} aria-hidden="true" /><span className="hidden sm:inline">Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-semibold text-stone-600 hover:text-ink">Sign in</Link>
              <Link to="/signup" className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white">Create account</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
