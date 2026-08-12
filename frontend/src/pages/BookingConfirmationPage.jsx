import { useQuery } from '@tanstack/react-query'
import { Check, MapPin } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { getBooking } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'

export function BookingConfirmationPage() {
  const { reference } = useParams()
  const bookingQuery = useQuery({ queryKey: ['booking', reference], queryFn: () => getBooking(reference), enabled: hasAccessToken() })
  if (!hasAccessToken()) return <Navigate to="/login" replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">Loading confirmation…</main>
  if (bookingQuery.isError) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">Booking unavailable.</main>
  const booking = bookingQuery.data
  if (booking.status !== 'CONFIRMED') return <Navigate to={`/bookings/${reference}/passengers`} replace />

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-20">
      <span className="grid size-14 place-items-center rounded-full bg-moss text-white"><Check size={26} /></span>
      <p className="mt-7 text-xs font-bold tracking-[0.16em] text-signal uppercase">Booking confirmed</p>
      <h1 className="mt-3 font-display text-5xl sm:text-6xl">You’re going to {booking.trip.route.destination}.</h1>
      <p className="mt-4 text-stone-500">Reference <strong className="text-ink">{booking.booking_reference}</strong></p>

      <dl className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-stone-200 sm:grid-cols-3">
        <Summary label="Departure" value={`${formatDateHeading(booking.trip.departure_datetime.slice(0, 10))}, ${formatTime(booking.trip.departure_datetime)}`} />
        <Summary label="Seats" value={booking.seats.map((seat) => seat.seat_code).join(', ')} />
        <Summary label="Paid" value={formatCurrency(booking.total_amount)} />
      </dl>
      <div className="mt-8 flex items-start gap-3 border-y border-stone-200 py-6 text-sm text-stone-500"><MapPin size={18} className="mt-0.5 shrink-0 text-moss" /><p>Your complete ticket with QR code will be added in the next phase. Keep your booking reference for now.</p></div>
      <Link to="/" className="mt-8 inline-block rounded-full bg-ink px-6 py-3 font-bold text-white">Search another trip</Link>
    </main>
  )
}

function Summary({ label, value }) {
  return <div className="bg-stone-50 p-5"><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-2 font-bold">{value}</dd></div>
}
