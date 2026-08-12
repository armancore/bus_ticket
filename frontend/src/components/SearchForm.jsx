import { useState } from 'react'
import { ArrowRight, CalendarDays, MapPin, Search } from 'lucide-react'

export function SearchForm({ filters, routes, onSearch }) {
  const [form, setForm] = useState(filters)
  const [validationError, setValidationError] = useState('')

  const origins = [...new Set(routes.map((route) => route.origin))]
  const destinations = [...new Set(
    routes
      .filter((route) => !form.origin || route.origin === form.origin)
      .map((route) => route.destination),
  )]

  function updateField(event) {
    const { name, value } = event.target
    setValidationError('')
    setForm((current) => ({
      ...current,
      [name]: value,
      ...(name === 'origin' ? { destination: '' } : {}),
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!form.origin || !form.destination || !form.date) {
      setValidationError('Choose an origin, destination, and travel date.')
      return
    }
    if (form.origin === form.destination) {
      setValidationError('Origin and destination must be different.')
      return
    }
    onSearch(form)
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8" noValidate>
      <div className="grid overflow-hidden rounded-2xl border border-white/15 bg-white shadow-2xl shadow-black/20 lg:grid-cols-[1fr_auto_1fr_1fr_auto]">
        <label className="group flex min-h-24 items-center gap-4 px-5 py-4">
          <MapPin className="shrink-0 text-signal" size={21} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-[0.14em] text-stone-400 uppercase">From</span>
            <select
              name="origin"
              value={form.origin}
              onChange={updateField}
              className="mt-1 w-full appearance-none bg-transparent text-base font-semibold text-ink outline-none"
            >
              <option value="">Choose origin</option>
              {origins.map((origin) => <option key={origin}>{origin}</option>)}
            </select>
          </span>
        </label>

        <div className="hidden items-center text-stone-300 lg:flex" aria-hidden="true">
          <ArrowRight size={18} />
        </div>

        <label className="flex min-h-24 items-center gap-4 border-t border-stone-100 px-5 py-4 lg:border-t-0">
          <MapPin className="shrink-0 text-stone-400" size={21} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-[0.14em] text-stone-400 uppercase">To</span>
            <select
              name="destination"
              value={form.destination}
              onChange={updateField}
              className="mt-1 w-full appearance-none bg-transparent text-base font-semibold text-ink outline-none"
            >
              <option value="">Choose destination</option>
              {destinations.map((destination) => <option key={destination}>{destination}</option>)}
            </select>
          </span>
        </label>

        <label className="flex min-h-24 items-center gap-4 border-t border-stone-100 px-5 py-4 lg:border-t-0 lg:border-l">
          <CalendarDays className="shrink-0 text-stone-400" size={21} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-bold tracking-[0.14em] text-stone-400 uppercase">Travel date</span>
            <input
              type="date"
              name="date"
              value={form.date}
              min={new Date().toLocaleDateString('en-CA')}
              onChange={updateField}
              className="mt-1 w-full bg-transparent text-base font-semibold text-ink outline-none"
            />
          </span>
        </label>

        <button
          type="submit"
          className="m-2 flex min-h-16 items-center justify-center gap-2 rounded-xl bg-signal px-7 font-bold text-white transition-all hover:bg-orange-600 active:scale-[0.98] lg:min-h-0"
        >
          <Search size={19} aria-hidden="true" />
          Search
        </button>
      </div>
      {validationError && <p className="mt-3 text-sm font-medium text-orange-200" role="alert">{validationError}</p>}
    </form>
  )
}
