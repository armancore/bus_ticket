import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BusFront, CalendarDays, UsersRound } from 'lucide-react'
import { Navigate } from 'react-router-dom'

import { getOperatorTrips, getPassengerManifest } from '../api/dashboards.js'
import { getStoredUser } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'

export function OperatorDashboardPage() {
  const user = getStoredUser()
  const [selectedTripId, setSelectedTripId] = useState(null)
  const tripsQuery = useQuery({ queryKey: ['operator-trips'], queryFn: getOperatorTrips, enabled: user?.role === 'OPERATOR' })
  const activeTripId = selectedTripId || tripsQuery.data?.[0]?.id || null
  const manifestQuery = useQuery({
    queryKey: ['operator-manifest', activeTripId],
    queryFn: () => getPassengerManifest(activeTripId),
    enabled: Boolean(activeTripId && user?.role === 'OPERATOR'),
  })

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'OPERATOR') return <Navigate to="/" replace />

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="border-b border-stone-300 pb-8">
        <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Operator workspace</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Trips and passengers</h1>
        <p className="mt-3 text-stone-500">Only buses and trips owned by {user.username} are available here.</p>
      </div>

      <div className="mt-9 grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
        <section aria-labelledby="operator-trips-heading">
          <div className="flex items-center gap-3"><BusFront className="text-moss" /><h2 id="operator-trips-heading" className="font-display text-3xl">Your trips</h2></div>
          {tripsQuery.isPending && <p className="mt-6 text-stone-500">Loading trips…</p>}
          {tripsQuery.isError && <DashboardError message="Your trips could not be loaded." />}
          <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
            {tripsQuery.data?.map((trip) => (
              <button key={trip.id} type="button" onClick={() => setSelectedTripId(trip.id)} className={`w-full px-2 py-5 text-left transition-colors ${trip.id === activeTripId ? 'bg-stone-200/70' : 'hover:bg-stone-100'}`}>
                <p className="font-bold">{trip.route.origin} → {trip.route.destination}</p>
                <p className="mt-2 flex items-center gap-2 text-sm text-stone-500"><CalendarDays size={15} /> {formatDateHeading(trip.departure_datetime.slice(0, 10))}, {formatTime(trip.departure_datetime)}</p>
                <p className="mt-1 text-xs font-semibold tracking-wider text-stone-400 uppercase">{trip.bus.name} · {trip.status}</p>
              </button>
            ))}
          </div>
          {tripsQuery.data?.length === 0 && <p className="mt-6 text-stone-500">No trips have been assigned to your buses.</p>}
        </section>

        <section aria-labelledby="manifest-heading">
          <div className="flex items-end justify-between gap-4">
            <div><div className="flex items-center gap-3"><UsersRound className="text-moss" /><h2 id="manifest-heading" className="font-display text-3xl">Passenger manifest</h2></div><p className="mt-2 text-sm text-stone-500">Confirmed passengers for the selected trip.</p></div>
            {manifestQuery.data && <p className="text-2xl font-bold">{manifestQuery.data.passenger_count}</p>}
          </div>
          {manifestQuery.isPending && activeTripId && <p className="mt-6 text-stone-500">Loading manifest…</p>}
          {manifestQuery.isError && <DashboardError message="The passenger manifest could not be loaded." />}
          {manifestQuery.data && <ManifestTable passengers={manifestQuery.data.passengers} />}
        </section>
      </div>
    </main>
  )
}

function ManifestTable({ passengers }) {
  if (!passengers.length) return <p className="mt-8 border-y border-stone-200 py-8 text-stone-500">No confirmed passengers yet.</p>
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-xl text-left text-sm">
        <thead className="border-b border-stone-300 text-xs tracking-wider text-stone-400 uppercase"><tr><th className="py-3">Seat</th><th>Passenger</th><th>Age / gender</th><th>Reference</th><th className="text-right">Fare</th></tr></thead>
        <tbody className="divide-y divide-stone-200">{passengers.map((passenger) => <tr key={`${passenger.booking_reference}-${passenger.seat_code}`}><td className="py-4 font-bold">{passenger.seat_code}</td><td>{passenger.passenger_name}</td><td>{passenger.age} · {passenger.gender}</td><td className="font-mono text-xs">{passenger.booking_reference}</td><td className="text-right font-semibold">{formatCurrency(passenger.fare_charged)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function DashboardError({ message }) {
  return <p className="mt-6 text-sm font-semibold text-red-700" role="alert">{message} Check your connection and role.</p>
}
