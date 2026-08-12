import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BusFront, CalendarDays, Clock3, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { getTrip, getTripSeatMap } from '../api/trips.js'
import { SeatMap } from '../components/SeatMap.jsx'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'

export function TripDetailsPage() {
  const { tripId } = useParams()
  const tripQuery = useQuery({ queryKey: ['trip', tripId], queryFn: () => getTrip(tripId) })
  const seatMapQuery = useQuery({
    queryKey: ['trip-seat-map', tripId],
    queryFn: () => getTripSeatMap(tripId),
    refetchInterval: 15_000,
  })

  if (tripQuery.isPending) {
    return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8"><p>Loading trip…</p></main>
  }

  if (tripQuery.isError) {
    return (
      <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">
        <h1 className="font-display text-4xl">Trip not available</h1>
        <Link to="/" className="mt-6 inline-block font-bold text-signal">Return to search</Link>
      </main>
    )
  }

  const trip = tripQuery.data
  return (
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink">
        <ArrowLeft size={17} aria-hidden="true" /> Back to trips
      </Link>

      <div className="mt-10 border-b border-stone-300 pb-9">
        <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Trip details</p>
        <h1 className="mt-3 font-display text-4xl sm:text-6xl">
          {trip.route.origin} <span className="text-stone-300">→</span> {trip.route.destination}
        </h1>
      </div>

      <div className="grid gap-10 py-10 md:grid-cols-[1.3fr_0.7fr]">
        <div className="relative journey-line space-y-9 pl-9">
          <JourneyStop city={trip.route.origin} time={formatTime(trip.departure_datetime)} />
          <div className="flex items-center gap-2 text-sm text-stone-500"><Clock3 size={16} /> Direct journey</div>
          <JourneyStop city={trip.route.destination} time={formatTime(trip.arrival_datetime)} />
        </div>

        <dl className="divide-y divide-stone-200 border-y border-stone-200">
          <Detail icon={CalendarDays} label="Travel date" value={formatDateHeading(trip.departure_datetime.slice(0, 10))} />
          <Detail icon={BusFront} label="Bus" value={`${trip.bus.name} · ${trip.bus.bus_type}`} />
          <Detail icon={MapPin} label="Distance" value={`${trip.route.distance} km`} />
          <div className="flex items-center justify-between py-5">
            <dt className="text-sm text-stone-500">Fare per seat</dt>
            <dd className="text-xl font-bold">{formatCurrency(trip.base_fare)}</dd>
          </div>
        </dl>
      </div>

      {seatMapQuery.isPending && <SeatMapLoading />}
      {seatMapQuery.isError && <SeatMapError onRetry={() => seatMapQuery.refetch()} />}
      {seatMapQuery.data && (
        <SeatMap
          layout={seatMapQuery.data.layout}
          seats={seatMapQuery.data.seats}
          refreshedAt={seatMapQuery.data.refreshed_at}
        />
      )}
    </main>
  )
}

function JourneyStop({ city, time }) {
  return (
    <div className="relative flex items-baseline justify-between gap-6">
      <span className="absolute -left-9 top-2 size-2.5 rounded-full bg-signal ring-4 ring-stone-50" />
      <div><p className="font-display text-3xl">{city}</p><p className="mt-1 text-sm text-stone-500">Bus station</p></div>
      <p className="text-2xl font-bold tabular-nums">{time}</p>
    </div>
  )
}

function Detail({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-3 py-5">
      <Icon size={18} className="mt-0.5 text-moss" aria-hidden="true" />
      <div><dt className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>
    </div>
  )
}

function SeatMapLoading() {
  return <div className="h-96 animate-pulse border-t border-stone-300 bg-stone-100" role="status"><span className="sr-only">Loading seat map</span></div>
}

function SeatMapError({ onRetry }) {
  return (
    <section className="border-t border-stone-300 py-10" role="alert">
      <h2 className="font-display text-3xl">Seat map unavailable</h2>
      <p className="mt-2 text-sm text-stone-500">The trip loaded, but live seat availability did not.</p>
      <button type="button" onClick={onRetry} className="mt-4 font-bold text-signal underline underline-offset-4">Try again</button>
    </section>
  )
}
