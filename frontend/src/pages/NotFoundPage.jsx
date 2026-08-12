import { ArrowLeft, MapPinOff } from 'lucide-react'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-20 sm:px-8 sm:py-28">
      <MapPinOff className="text-moss" size={32} aria-hidden="true" />
      <p className="mt-6 text-xs font-bold tracking-[0.16em] text-signal uppercase">404 · Route not found</p>
      <h1 className="mt-3 font-display text-5xl sm:text-6xl">This journey is not on the timetable.</h1>
      <p className="mt-5 max-w-xl leading-7 text-stone-500">The address may be incorrect, or the page may have moved.</p>
      <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-bold text-white"><ArrowLeft size={17} /> Return to trip search</Link>
    </main>
  )
}
