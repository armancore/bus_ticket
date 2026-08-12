import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Ticket, XCircle } from 'lucide-react'
import { Link, Navigate } from 'react-router-dom'

import { cancelBooking, getMyBookings } from '../api/bookings.js'
import { getStoredUser } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'
import { QueryError } from '../components/QueryError.jsx'

export function MyBookingsPage() {
  const user = getStoredUser()
  const queryClient = useQueryClient()
  const bookingsQuery = useQuery({
    queryKey: ['my-bookings'],
    queryFn: getMyBookings,
    enabled: user?.role === 'CUSTOMER',
  })
  const cancelMutation = useMutation({
    mutationFn: cancelBooking,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-bookings'] }),
  })

  if (!user) return <Navigate to="/login?next=%2Fbookings" replace />
  if (user.role !== 'CUSTOMER') return <Navigate to="/" replace />

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-stone-300 pb-8">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Customer account</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">My bookings</h1>
          <p className="mt-3 text-stone-500">View tickets and follow the status of every reservation.</p>
        </div>
        <Link to="/" className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-white">Find another trip</Link>
      </div>

      {bookingsQuery.isPending && <p className="py-12 text-stone-500">Loading your bookings…</p>}
      {bookingsQuery.isError && <QueryError title="Your bookings could not be loaded" message="Check the connection or sign in again." onRetry={() => bookingsQuery.refetch()} />}
      {bookingsQuery.data?.length === 0 && <EmptyBookings />}
      <div className="divide-y divide-stone-200">
        {bookingsQuery.data?.map((booking) => (
          <BookingRow
            key={booking.booking_reference}
            booking={booking}
            onCancel={() => confirmCancel(() => cancelMutation.mutate(booking.booking_reference))}
            isCancelling={cancelMutation.isPending && cancelMutation.variables === booking.booking_reference}
          />
        ))}
      </div>
      {cancelMutation.isError && <p className="mt-6 text-sm font-semibold text-red-700" role="alert">{cancelMutation.error.response?.data?.detail || 'The booking could not be cancelled.'}</p>}
    </main>
  )
}

function BookingRow({ booking, onCancel, isCancelling }) {
  const canCancel = ['PENDING', 'CONFIRMED'].includes(booking.status) && new Date(booking.trip.departure_datetime) > new Date()
  return (
    <article className="grid gap-6 py-8 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-3"><Status value={booking.status} /><p className="font-mono text-xs font-bold tracking-wider text-stone-400">{booking.booking_reference}</p></div>
        <h2 className="mt-4 font-display text-3xl">{booking.trip.route.origin} <span className="text-stone-300">→</span> {booking.trip.route.destination}</h2>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-stone-500">
          <span className="flex items-center gap-2"><CalendarDays size={15} />{formatDateHeading(booking.trip.departure_datetime.slice(0, 10))}, {formatTime(booking.trip.departure_datetime)}</span>
          <span className="flex items-center gap-2"><MapPin size={15} />Seats {booking.seats.map((seat) => seat.seat_code).join(', ')}</span>
        </div>
      </div>
      <div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Total amount</p><p className="mt-2 text-xl font-bold">{formatCurrency(booking.total_amount)}</p></div>
      <div className="flex gap-3 lg:justify-end">
        {booking.status === 'CONFIRMED' && <Link to={`/tickets/${booking.booking_reference}`} className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"><Ticket size={17} /> Ticket</Link>}
        {booking.status === 'PENDING' && <Link to={`/bookings/${booking.booking_reference}/passengers`} className="rounded-full bg-signal px-5 py-3 text-sm font-bold text-white">Continue</Link>}
        {canCancel && <button type="button" onClick={onCancel} disabled={isCancelling} className="flex items-center gap-2 rounded-full border border-stone-300 px-4 py-3 text-sm font-bold text-stone-500 hover:text-red-700 disabled:opacity-50"><XCircle size={16} />{isCancelling ? 'Cancelling…' : 'Cancel'}</button>}
      </div>
    </article>
  )
}

function Status({ value }) {
  const styles = { CONFIRMED: 'bg-green-100 text-green-800', PENDING: 'bg-orange-100 text-orange-800', CANCELLED: 'bg-stone-200 text-stone-600', EXPIRED: 'bg-red-100 text-red-800' }
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles[value]}`}>{value}</span>
}

function EmptyBookings() {
  return <section className="py-16"><Ticket className="text-moss" /><h2 className="mt-4 font-display text-3xl">No bookings yet</h2><p className="mt-2 text-stone-500">Your confirmed tickets and pending holds will appear here.</p><Link to="/" className="mt-6 inline-block font-bold text-signal">Search available trips</Link></section>
}

function confirmCancel(action) {
  if (window.confirm('Cancel this booking and release its seats?')) action()
}
