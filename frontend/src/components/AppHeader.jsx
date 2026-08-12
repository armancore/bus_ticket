import { BusFront, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'

export function AppHeader() {
  return (
    <header className="border-b border-stone-200/80 bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label="Sajilo Bus home">
          <span className="grid size-10 place-items-center rounded-full bg-ink text-white">
            <BusFront size={19} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-display text-xl leading-none">Sajilo Bus</span>
            <span className="mt-1 block text-[10px] font-bold tracking-[0.18em] text-stone-500 uppercase">
              Travel Nepal
            </span>
          </span>
        </Link>

        <button
          type="button"
          className="flex items-center gap-2 text-sm font-semibold text-stone-600 transition-colors hover:text-ink"
          aria-label="Account features will be added in a later phase"
        >
          <UserRound size={18} aria-hidden="true" />
          <span className="hidden sm:inline">My account</span>
        </button>
      </div>
    </header>
  )
}
