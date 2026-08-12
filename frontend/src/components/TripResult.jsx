import { ArrowRight, BusFront, Clock3 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { formatCurrency, formatDuration, formatTime } from '../utils/formatters.js'

export function TripResult({ trip, index }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.28 }}
      className="grid gap-6 border-b border-stone-200 py-7 md:grid-cols-[1fr_1.3fr_auto] md:items-center"
    >
      <div className="flex items-center gap-4">
        <span className="grid size-12 place-items-center rounded-full bg-stone-100 text-moss">
          <BusFront size={22} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <div>
          <h3 className="font-bold text-ink">{trip.bus.name}</h3>
          <p className="mt-1 text-sm text-stone-500">{trip.bus.bus_type} · {trip.bus.operator_name}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-bold tabular-nums">{formatTime(trip.departure_datetime)}</p>
          <p className="mt-1 text-sm text-stone-500">{trip.route.origin}</p>
        </div>
        <div className="min-w-24 flex-1 text-center text-stone-400">
          <p className="flex items-center justify-center gap-1 text-xs font-semibold">
            <Clock3 size={13} aria-hidden="true" /> {formatDuration(trip.route.estimated_duration)}
          </p>
          <div className="my-2 flex items-center">
            <span className="size-2 rounded-full border-2 border-moss" />
            <span className="h-px flex-1 bg-stone-300" />
            <ArrowRight size={14} />
          </div>
          <p className="text-[11px] uppercase tracking-wider">Direct</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tabular-nums">{formatTime(trip.arrival_datetime)}</p>
          <p className="mt-1 text-sm text-stone-500">{trip.route.destination}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-6 md:block md:text-right">
        <div>
          <p className="text-xs font-semibold tracking-wider text-stone-400 uppercase">From</p>
          <p className="mt-1 text-xl font-bold">{formatCurrency(trip.base_fare)}</p>
        </div>
        <Link
          to={`/trips/${trip.id}`}
          className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-5 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
        >
          View trip
        </Link>
      </div>
    </motion.article>
  )
}
