import { CircleX } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

export function PaymentFailurePage() {
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('booking')
  return (
    <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <CircleX className="text-red-700" size={42} aria-hidden="true" />
      <p className="mt-7 text-xs font-bold tracking-[0.16em] text-red-700 uppercase">Payment not completed</p>
      <h1 className="mt-3 font-display text-5xl sm:text-6xl">No seats were sold.</h1>
      <p className="mt-4 max-w-xl leading-7 text-stone-500">The eSewa attempt failed or could not be verified. The seat hold was released{reference ? ` for booking ${reference}` : ''}, so you can safely start again.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link to="/" className="rounded-full bg-ink px-6 py-3 font-bold text-white">Search trips again</Link><Link to="/bookings" className="rounded-full border border-stone-300 px-6 py-3 font-bold text-stone-600">My bookings</Link></div>
    </main>
  )
}
