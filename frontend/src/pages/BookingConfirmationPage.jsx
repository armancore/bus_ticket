import { useQuery } from '@tanstack/react-query'
import { Check, QrCode } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { getBooking } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'
import { QueryError } from '../components/QueryError.jsx'

export function BookingConfirmationPage() {
  const { reference } = useParams()
  const bookingQuery = useQuery({ queryKey: ['booking', reference], queryFn: () => getBooking(reference), enabled: hasAccessToken() })
  if (!hasAccessToken()) return <Navigate to="/login" replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">Loading confirmation…</main>
  if (bookingQuery.isError) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8"><QueryError title="Confirmation could not be loaded" message="Check your connection or open the booking from your account." onRetry={() => bookingQuery.refetch()} /><Link to="/bookings" className="font-bold text-signal">My bookings</Link></main>
  const booking = bookingQuery.data
  if (booking.status !== 'CONFIRMED') return <Navigate to={`/bookings/${reference}/passengers`} replace />
  const paidOnline = booking.payments.some((payment) => payment.status === 'PAID')

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-20">
      <span className="grid size-14 place-items-center rounded-full bg-moss text-white"><Check size={26} /></span>
      <p className="mt-7 text-xs font-bold tracking-[0.16em] text-signal uppercase">Booking confirmed</p>
      <h1 className="mt-3 font-display text-5xl sm:text-6xl">You’re going to {booking.trip.route.destination}.</h1>
      <p className="mt-4 text-stone-500">Reference <strong className="text-ink">{booking.booking_reference}</strong></p>

      <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-stone-200 sm:grid-cols-3">
        <Summary label="Departure" value={`${formatDateHeading(booking.trip.departure_datetime.slice(0, 10))}, ${formatTime(booking.trip.departure_datetime)}`} />
        <Summary label="Seats" value={booking.seats.map((seat) => seat.seat_code).join(', ')} />
        <Summary label={paidOnline ? 'Paid online' : 'Due at counter'} value={formatCurrency(booking.total_amount)} />
      </dl>
      <div className="mt-8 flex items-start gap-3 border-y border-stone-200 py-6 text-sm text-stone-500"><QrCode size={18} className="mt-0.5 shrink-0 text-moss" /><p>{paidOnline ? 'Your ticket is ready.' : 'Your seats are reserved. Please pay at the counter before departure.'} Its QR code contains booking reference {booking.booking_reference}.</p></div>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link to={`/tickets/${booking.booking_reference}`} className="rounded-full bg-ink px-6 py-3 font-bold text-white">View ticket</Link>
        <Link to="/" className="rounded-full border border-stone-300 px-6 py-3 font-bold text-stone-600">Search another trip</Link>
      </div>
    </main>
  )
}

function Summary({ label, value }) {
  return <div className="bg-stone-50 p-5"><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-2 font-bold">{value}</dd></div>
}
