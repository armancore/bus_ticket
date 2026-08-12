import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'

import { getAdminBookings, getAdminSummary } from '../api/dashboards.js'
import { getStoredUser } from '../api/client.js'
import { formatCurrency, formatDateHeading } from '../utils/formatters.js'

export function AdminDashboardPage() {
  const user = getStoredUser()
  const summaryQuery = useQuery({ queryKey: ['admin-summary'], queryFn: getAdminSummary, enabled: user?.role === 'ADMIN' })
  const bookingsQuery = useQuery({ queryKey: ['admin-bookings'], queryFn: getAdminBookings, enabled: user?.role === 'ADMIN' })
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="border-b border-stone-300 pb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Administration</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Booking overview</h1>
        <p className="mt-3 text-stone-500">System-wide booking and revenue information.</p>
      </div>

      {summaryQuery.isError && <p className="mt-8 text-red-700" role="alert">Admin summary could not be loaded.</p>}
      {summaryQuery.data && (
        <dl className="grid border-b border-stone-300 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="All bookings" value={summaryQuery.data.total_bookings} />
          <Metric label="Confirmed" value={summaryQuery.data.confirmed_bookings} />
          <Metric label="Revenue" value={formatCurrency(summaryQuery.data.total_revenue)} />
          <Metric label="Occupancy" value={`${summaryQuery.data.occupancy_rate}%`} />
        </dl>
      )}

      <section className="mt-10" aria-labelledby="all-bookings-heading">
        <div className="flex items-end justify-between"><div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Operations</p><h2 id="all-bookings-heading" className="mt-2 font-display text-3xl">Recent bookings</h2></div></div>
        {bookingsQuery.isPending && <p className="mt-6 text-stone-500">Loading bookings…</p>}
        {bookingsQuery.isError && <p className="mt-6 text-red-700" role="alert">Bookings could not be loaded.</p>}
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-3xl text-left text-sm">
            <thead className="border-b border-stone-300 text-xs tracking-wider text-stone-400 uppercase"><tr><th className="py-3">Reference</th><th>Journey</th><th>Travel date</th><th>Seats</th><th>Status</th><th className="text-right">Amount</th></tr></thead>
            <tbody className="divide-y divide-stone-200">{bookingsQuery.data?.map((booking) => <tr key={booking.booking_reference}><td className="py-4 font-mono font-bold">{booking.booking_reference}</td><td>{booking.trip.route.origin} → {booking.trip.route.destination}</td><td>{formatDateHeading(booking.trip.departure_datetime.slice(0, 10))}</td><td>{booking.seats.map((seat) => seat.seat_code).join(', ')}</td><td><Status value={booking.status} /></td><td className="text-right font-bold">{formatCurrency(booking.total_amount)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value }) {
  return <div className="border-stone-300 py-7 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-2 text-3xl font-bold">{value}</dd></div>
}

function Status({ value }) {
  const style = value === 'CONFIRMED' ? 'bg-green-100 text-green-800' : value === 'PENDING' ? 'bg-orange-100 text-orange-800' : 'bg-stone-200 text-stone-600'
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${style}`}>{value}</span>
}
