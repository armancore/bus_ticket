import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { getRoutes, searchTrips } from '../api/trips.js'
import { SearchForm } from '../components/SearchForm.jsx'
import { TripResult } from '../components/TripResult.jsx'
import { formatDateHeading, tomorrowISO } from '../utils/formatters.js'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = {
    origin: searchParams.get('origin') || '',
    destination: searchParams.get('destination') || '',
    date: searchParams.get('date') || '',
  }
  const hasSearch = Boolean(filters.origin && filters.destination && filters.date)

  useEffect(() => {
    if (![...searchParams.keys()].length) {
      setSearchParams(
        { origin: 'Kathmandu', destination: 'Pokhara', date: tomorrowISO() },
        { replace: true },
      )
    }
  }, [searchParams, setSearchParams])

  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: getRoutes })
  const tripsQuery = useQuery({
    queryKey: ['trips', filters],
    queryFn: () => searchTrips(filters),
    enabled: hasSearch,
  })

  return (
    <main>
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 opacity-20" aria-hidden="true">
          <div className="absolute -top-24 right-[8%] h-72 w-px rotate-35 bg-white" />
          <div className="absolute -top-24 right-[17%] h-96 w-px rotate-35 bg-white" />
          <div className="absolute right-[5%] bottom-0 h-28 w-80 rounded-t-full border-t border-white/50" />
        </div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="relative mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-18"
        >
          <p className="text-xs font-bold tracking-[0.2em] text-orange-300 uppercase">Intercity bus tickets</p>
          <h1 className="mt-4 max-w-2xl font-display text-4xl leading-[1.05] sm:text-6xl">
            Your next city is one comfortable ride away.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-stone-300">
            Compare upcoming buses and choose the journey that fits your day.
          </p>

          <SearchForm
            key={`${filters.origin}-${filters.destination}-${filters.date}`}
            filters={filters}
            routes={routesQuery.data || []}
            onSearch={(values) => setSearchParams(values)}
          />
          {routesQuery.isError && (
            <p className="mt-3 text-sm text-orange-200" role="alert">
              Routes could not be loaded. Check that the Django server is running.
            </p>
          )}
        </motion.div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16" aria-live="polite">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-300 pb-5">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Available journeys</p>
            <h2 className="mt-2 font-display text-3xl sm:text-4xl">
              {hasSearch ? `${filters.origin} to ${filters.destination}` : 'Search for a trip'}
            </h2>
          </div>
          {hasSearch && <p className="text-sm font-semibold text-stone-500">{formatDateHeading(filters.date)}</p>}
        </div>

        {tripsQuery.isPending && hasSearch && <LoadingResults />}
        {tripsQuery.isError && <ErrorResults onRetry={() => tripsQuery.refetch()} />}
        {tripsQuery.isSuccess && tripsQuery.data.length === 0 && <EmptyResults />}
        {tripsQuery.data?.map((trip, index) => (
          <TripResult key={trip.id} trip={trip} index={index} />
        ))}

        <div className="mt-10 flex items-center gap-3 text-sm text-stone-500">
          <ShieldCheck size={18} className="text-moss" aria-hidden="true" />
          Seat holds stay protected during the countdown while you enter passenger details.
        </div>
      </section>
    </main>
  )
}

function LoadingResults() {
  return (
    <div className="space-y-1 py-4" role="status">
      {[1, 2].map((item) => (
        <div key={item} className="h-32 animate-pulse border-b border-stone-200 bg-stone-100/60" />
      ))}
      <span className="sr-only">Loading trips</span>
    </div>
  )
}

function ErrorResults({ onRetry }) {
  return (
    <div className="flex items-start gap-4 py-12" role="alert">
      <AlertCircle className="mt-1 text-signal" aria-hidden="true" />
      <div>
        <h3 className="font-bold">Trips could not be loaded</h3>
        <p className="mt-1 text-sm text-stone-500">Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className="mt-4 text-sm font-bold text-signal underline underline-offset-4">
          Try again
        </button>
      </div>
    </div>
  )
}

function EmptyResults() {
  return (
    <div className="py-14">
      <h3 className="font-display text-2xl">No scheduled buses found.</h3>
      <p className="mt-2 text-stone-500">Try another date or destination.</p>
    </div>
  )
}
