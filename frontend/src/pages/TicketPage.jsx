import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BusFront, CalendarDays, Clock3, MapPin, Printer, UserRound } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { Link, Navigate, useParams } from 'react-router-dom'

import { getBooking } from '../api/bookings.js'
import { getStoredUser } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'
import { QueryError } from '../components/QueryError.jsx'

export function TicketPage() {
  const { reference } = useParams()
  const user = getStoredUser()
  const bookingQuery = useQuery({
    queryKey: ['booking', reference],
    queryFn: () => getBooking(reference),
    enabled: user?.role === 'CUSTOMER',
  })

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(`/tickets/${reference}`)}`} replace />
  if (user.role !== 'CUSTOMER') return <Navigate to="/" replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8">Loading ticket…</main>
  if (bookingQuery.isError) {
    const isMissing = bookingQuery.error.response?.status === 404
    return <TicketUnavailable message={isMissing ? 'This ticket does not exist or belongs to another customer.' : 'The ticket could not be loaded. Check your connection.'} onRetry={isMissing ? undefined : () => bookingQuery.refetch()} />
  }
  if (bookingQuery.data.status !== 'CONFIRMED') return <TicketUnavailable message={`A ${bookingQuery.data.status.toLowerCase()} booking does not have an active ticket.`} />

  return <ConfirmedTicket booking={bookingQuery.data} />
}

function ConfirmedTicket({ booking }) {
  const payment = booking.payments.find((item) => item.status === 'SUCCESS')
  return (
    <main className="ticket-page mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="ticket-actions mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/bookings" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink"><ArrowLeft size={17} /> My bookings</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-bold text-white"><Printer size={17} /> Print ticket</button>
      </div>

      <article className="ticket-document overflow-hidden rounded-[2rem] border border-stone-300 bg-white shadow-xl shadow-stone-300/30" aria-labelledby="ticket-heading">
        <header className="grid gap-8 bg-ink px-7 py-8 text-white sm:grid-cols-[1fr_auto] sm:px-10">
          <div>
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-white text-ink"><BusFront size={19} /></span><div><p className="font-display text-2xl">Sajilo Bus</p><p className="text-[10px] font-bold tracking-[0.18em] text-stone-400 uppercase">Travel Nepal</p></div></div>
            <p className="mt-8 text-xs font-bold tracking-[0.18em] text-orange-300 uppercase">Confirmed e-ticket</p>
            <h1 id="ticket-heading" className="mt-2 font-display text-4xl sm:text-5xl">{booking.trip.route.origin} <span className="text-stone-500">→</span> {booking.trip.route.destination}</h1>
          </div>
          <div className="self-end sm:text-right"><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Booking reference</p><p className="mt-2 font-mono text-xl font-bold tracking-wider">{booking.booking_reference}</p></div>
        </header>

        <div className="grid lg:grid-cols-[1fr_240px]">
          <div className="px-7 py-8 sm:px-10">
            <dl className="grid gap-7 border-b border-stone-200 pb-8 sm:grid-cols-2">
              <TicketDetail icon={CalendarDays} label="Travel date" value={formatDateHeading(booking.trip.departure_datetime.slice(0, 10))} />
              <TicketDetail icon={Clock3} label="Departure" value={`${formatTime(booking.trip.departure_datetime)} · arrive ${formatTime(booking.trip.arrival_datetime)}`} />
              <TicketDetail icon={BusFront} label="Bus" value={`${booking.trip.bus.name} · ${booking.trip.bus.plate_number}`} />
              <TicketDetail icon={MapPin} label="Route" value={`${booking.trip.route.distance} km · ${booking.trip.bus.bus_type}`} />
            </dl>

            <section className="py-8" aria-labelledby="passenger-heading">
              <h2 id="passenger-heading" className="text-xs font-bold tracking-[0.16em] text-stone-400 uppercase">Passengers</h2>
              <div className="mt-4 divide-y divide-stone-200 border-y border-stone-200">
                {booking.seats.map((seat) => <div key={seat.seat_code} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4"><span className="grid size-11 place-items-center rounded-xl bg-stone-100 font-bold">{seat.seat_code}</span><div><p className="font-bold">{seat.passenger_name}</p><p className="mt-1 text-xs text-stone-500">{seat.age} years · {seat.gender}</p></div><p className="font-bold">{formatCurrency(seat.fare)}</p></div>)}
              </div>
            </section>

            <div className="flex flex-wrap justify-between gap-5 border-t border-dashed border-stone-300 pt-6 text-sm"><div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Payment</p><p className="mt-2 font-mono font-bold">{payment?.transaction_reference || 'CONFIRMED'}</p></div><div className="text-right"><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Total paid</p><p className="mt-2 text-2xl font-bold">{formatCurrency(booking.total_amount)}</p></div></div>
          </div>

          <aside className="flex flex-col items-center justify-center border-t border-dashed border-stone-300 bg-stone-50 px-6 py-8 text-center lg:border-t-0 lg:border-l">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <QRCodeSVG value={booking.booking_reference} size={160} level="H" marginSize={1} title={`Booking reference ${booking.booking_reference}`} />
            </div>
            <p className="mt-5 text-xs font-bold tracking-wider text-stone-400 uppercase">Scan at boarding</p>
            <p className="mt-2 font-mono text-sm font-bold">{booking.booking_reference}</p>
            <p className="mt-4 text-xs leading-5 text-stone-500">Bring a matching photo ID and arrive at least 20 minutes before departure.</p>
          </aside>
        </div>
      </article>
    </main>
  )
}

function TicketDetail({ icon: Icon, label, value }) {
  return <div className="flex gap-3"><Icon size={18} className="mt-0.5 shrink-0 text-moss" /><div><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div></div>
}

function TicketUnavailable({ message, onRetry }) {
  return <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8"><UserRound className="text-stone-400" /><h1 className="mt-5 font-display text-4xl">Ticket unavailable</h1><QueryError title="The ticket is not available" message={message} onRetry={onRetry} /><Link to="/bookings" className="inline-block font-bold text-signal">Return to my bookings</Link></main>
}
