import { useQuery } from '@tanstack/react-query'
import { BadgeCheck, Ticket } from 'lucide-react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'

import { getBooking } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { QueryError } from '../components/QueryError.jsx'
import { formatCurrency } from '../utils/formatters.js'

export function PaymentSuccessPage() {
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('booking') || ''
  const bookingQuery = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => getBooking(reference),
    enabled: Boolean(reference && hasAccessToken()),
  })

  if (!hasAccessToken()) return <Navigate to={`/login?next=${encodeURIComponent(`/payment/success?booking=${reference}`)}`} replace />
  if (!reference) return <InvalidReturn />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-4xl px-5 py-20 text-stone-500 sm:px-8" role="status">Loading verified booking…</main>
  if (bookingQuery.isError) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8"><QueryError title="The verified booking could not be loaded" message="Your payment return was received. Try loading the booking again." onRetry={() => bookingQuery.refetch()} /></main>
  if (bookingQuery.data.status !== 'CONFIRMED') return <InvalidReturn />

  const booking = bookingQuery.data
  return (
    <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <span className="grid size-16 place-items-center rounded-full bg-[#38852b] text-white"><BadgeCheck size={30} /></span>
      <p className="mt-7 text-xs font-bold tracking-[0.16em] text-[#38852b] uppercase">Payment verified</p>
      <h1 className="mt-3 font-display text-5xl sm:text-6xl">Your seats are confirmed.</h1>
      <p className="mt-4 max-w-xl leading-7 text-stone-500">Django checked the transaction directly with eSewa before confirming booking <strong className="text-ink">{reference}</strong>.</p>
      <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-stone-200 sm:grid-cols-2">
        <Summary label="Journey" value={`${booking.trip.route.origin} → ${booking.trip.route.destination}`} />
        <Summary label="Paid" value={formatCurrency(booking.total_amount)} />
      </dl>
      <div className="mt-8 flex flex-wrap gap-3"><Link to={`/tickets/${reference}`} className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 font-bold text-white"><Ticket size={18} /> View QR ticket</Link><Link to="/bookings" className="rounded-full border border-stone-300 px-6 py-3 font-bold text-stone-600">My bookings</Link></div>
    </main>
  )
}

function InvalidReturn() {
  return <main className="mx-auto max-w-4xl px-5 py-20 sm:px-8"><h1 className="font-display text-4xl">Payment confirmation unavailable</h1><p className="mt-3 text-stone-500">Open My bookings to check the latest server-verified status.</p><Link to="/bookings" className="mt-6 inline-block font-bold text-signal">My bookings</Link></main>
}

function Summary({ label, value }) {
  return <div className="bg-stone-50 p-5"><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-2 font-bold">{value}</dd></div>
}
