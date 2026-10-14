import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Bus, Check, CheckCircle2, Clock3, ExternalLink, Store, Wallet } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { confirmCounterBooking, getBooking, initiateEsewaPayment, savePassengerDetails } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { formatCurrency, formatShortDate, formatTime } from '../utils/formatters.js'
import { QueryError } from '../components/QueryError.jsx'

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
]

export function PassengerDetailsPage() {
  const { reference } = useParams()
  const bookingQuery = useQuery({ queryKey: ['booking', reference], queryFn: () => getBooking(reference), enabled: hasAccessToken() })

  if (!hasAccessToken()) return <Navigate to={`/login?next=${encodeURIComponent(`/bookings/${reference}/passengers`)}`} replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">Loading your hold…</main>
  if (bookingQuery.isError) return <BookingLoadError error={bookingQuery.error} onRetry={() => bookingQuery.refetch()} />
  return <PassengerForm key={bookingQuery.data.booking_reference} booking={bookingQuery.data} />
}

// Returns a message per invalid field; an empty object means the passenger is complete.
function passengerErrors(passenger) {
  const errors = {}
  const age = Number(passenger.age)
  if (passenger.passenger_name.trim().length < 2) errors.passenger_name = 'Enter the full name as on a photo ID.'
  if (passenger.age === '' || !Number.isInteger(age) || age < 1 || age > 120) errors.age = 'Enter 1 to 120.'
  if (!passenger.gender) errors.gender = 'Choose one.'
  return errors
}

function fieldId(seatCode, field) {
  return `passenger-${seatCode}-${field}`
}

function PassengerForm({ booking }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remainingSeconds = useCountdown(booking.hold_expires_at)
  const [redirecting, setRedirecting] = useState(false)
  const [counterBookingConfirmed, setCounterBookingConfirmed] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('esewa')
  const [passengers, setPassengers] = useState(() => booking.seats.map((seat) => ({
    seat_code: seat.seat_code,
    passenger_name: '',
    age: '',
    gender: '',
  })))

  const paymentMutation = useMutation({
    mutationFn: async (passengerPayload) => {
      await savePassengerDetails({
        reference: booking.booking_reference,
        passengers: passengerPayload,
      })
      return initiateEsewaPayment(booking.id)
    },
    onSuccess: (paymentForm) => {
      setRedirecting(true)
      queryClient.invalidateQueries({ queryKey: ['booking', booking.booking_reference] })
      window.setTimeout(() => submitGatewayForm(paymentForm), 100)
    },
  })

  const counterMutation = useMutation({
    mutationFn: async (passengerPayload) => {
      await savePassengerDetails({
        reference: booking.booking_reference,
        passengers: passengerPayload,
      })
      return confirmCounterBooking(booking.booking_reference)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['booking', booking.booking_reference] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setCounterBookingConfirmed(true)
    },
  })

  useEffect(() => {
    if (!counterBookingConfirmed) return undefined

    function handleEscape(event) {
      if (event.key === 'Escape') navigate(`/bookings/${booking.booking_reference}/confirmed`)
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [booking.booking_reference, counterBookingConfirmed, navigate])

  function updatePassenger(index, field, value) {
    setPassengers((current) => current.map((passenger, itemIndex) => itemIndex === index ? {...passenger, [field]: value} : passenger))
  }

  function passengerPayload() {
    return passengers.map((passenger) => ({...passenger, passenger_name: passenger.passenger_name.trim(), age: Number(passenger.age)}))
  }

  const errors = passengers.map(passengerErrors)
  const completeCount = errors.filter((fieldErrors) => Object.keys(fieldErrors).length === 0).length
  const allComplete = completeCount === passengers.length

  function handleSubmit(event) {
    event.preventDefault()
    if (!allComplete) {
      setShowErrors(true)
      const firstIndex = errors.findIndex((fieldErrors) => Object.keys(fieldErrors).length > 0)
      const firstField = Object.keys(errors[firstIndex])[0]
      document.getElementById(fieldId(passengers[firstIndex].seat_code, firstField))?.focus()
      return
    }
    if (paymentMethod === 'esewa') paymentMutation.mutate(passengerPayload())
    else counterMutation.mutate(passengerPayload())
  }

  const expired = booking.status === 'EXPIRED' || remainingSeconds <= 0
  const apiError = (paymentMutation.error || counterMutation.error)?.response?.data
  const submitting = paymentMutation.isPending || counterMutation.isPending
  const fareBySeat = Object.fromEntries(booking.seats.map((seat) => [seat.seat_code, seat.fare]))

  if (redirecting) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8" role="status">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-[#60bb46] text-white"><ExternalLink size={26} /></span>
        <p className="mt-7 text-xs font-bold tracking-[0.16em] text-[#38852b] uppercase">Secure payment handoff</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Redirecting to eSewa…</h1>
        <p className="mt-4 text-stone-500">Do not close this tab. You will return here after eSewa verifies the payment.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link to={`/trips/${booking.trip.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink"><ArrowLeft size={17} /> Back to seat map</Link>
      <div className="mt-8">
        <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Booking {booking.booking_reference}</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">Who&apos;s travelling?</h1>
        <p className="mt-3 text-stone-500">Add details for each seat. Names should match the photo ID shown when boarding.</p>
      </div>

      {expired ? <ExpiredHold tripId={booking.trip.id} /> : (
        <form onSubmit={handleSubmit} noValidate className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <ProgressBar complete={completeCount} total={passengers.length} />
            <ol className="mt-6 grid gap-5">
              {passengers.map((passenger, index) => (
                <PassengerCard
                  key={passenger.seat_code}
                  index={index}
                  passenger={passenger}
                  fare={fareBySeat[passenger.seat_code]}
                  errors={errors[index]}
                  showErrors={showErrors}
                  onChange={(field, value) => updatePassenger(index, field, value)}
                />
              ))}
            </ol>
          </div>

          <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
            <Countdown seconds={remainingSeconds} expired={expired} />

            <div className="mt-6 flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-canvas text-moss"><Bus size={19} /></span>
              <div>
                <p className="font-bold">{booking.trip.route.origin} → {booking.trip.route.destination}</p>
                <p className="mt-0.5 text-sm text-stone-500">{formatShortDate(booking.trip.departure_datetime)} · {formatTime(booking.trip.departure_datetime)} · {booking.trip.bus.name}</p>
              </div>
            </div>

            <dl className="mt-6 grid gap-2 border-t border-stone-200 pt-5 text-sm">
              {booking.seats.map((seat) => (
                <div key={seat.seat_code} className="flex justify-between"><dt className="text-stone-500">Seat {seat.seat_code}</dt><dd className="tabular-nums">{formatCurrency(seat.fare)}</dd></div>
              ))}
              <div className="mt-2 flex items-baseline justify-between border-t border-stone-200 pt-3"><dt className="font-bold">Total</dt><dd className="text-2xl font-bold tabular-nums">{formatCurrency(booking.total_amount)}</dd></div>
            </dl>

            <fieldset className="mt-6">
              <legend className="text-xs font-bold tracking-wider text-stone-500 uppercase">Payment</legend>
              <div className="mt-3 grid gap-3">
                <PaymentOption
                  value="esewa"
                  selected={paymentMethod}
                  onSelect={setPaymentMethod}
                  icon={<Wallet size={19} />}
                  title="Pay now with eSewa"
                  description="Seats are confirmed once eSewa verifies the payment."
                  accent="text-[#38852b]"
                />
                <PaymentOption
                  value="counter"
                  selected={paymentMethod}
                  onSelect={setPaymentMethod}
                  icon={<Store size={19} />}
                  title="Reserve, pay at counter"
                  description={`Book now and pay ${formatCurrency(booking.total_amount)} at the bus counter before departure.`}
                  accent="text-signal"
                />
              </div>
            </fieldset>

            {showErrors && !allComplete && <p className="mt-5 flex gap-2 text-sm font-semibold text-red-700" role="alert"><AlertTriangle size={17} className="mt-0.5 shrink-0" />Complete the highlighted passenger details.</p>}
            {apiError && <p className="mt-5 flex gap-2 text-sm font-semibold text-red-700" role="alert"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{apiError.detail || 'The booking could not be completed.'}</p>}

            <button
              disabled={submitting}
              className={`mt-6 w-full rounded-full px-6 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${paymentMethod === 'esewa' ? 'bg-[#38852b]' : 'bg-signal'}`}
            >
              {paymentMethod === 'esewa'
                ? (paymentMutation.isPending ? 'Preparing eSewa…' : `Pay ${formatCurrency(booking.total_amount)} with eSewa`)
                : (counterMutation.isPending ? 'Booking seats…' : 'Reserve seats')}
            </button>
            {paymentMethod === 'esewa' && <p className="mt-3 text-center text-xs text-stone-500">You will continue to the eSewa UAT checkout.</p>}
          </aside>
        </form>
      )}

      {counterBookingConfirmed && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 px-5 py-8 backdrop-blur-sm" role="presentation">
          <section
            aria-describedby="counter-booking-message"
            aria-labelledby="counter-booking-title"
            aria-modal="true"
            className="w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl sm:p-9"
            role="dialog"
          >
            <span className="grid size-14 place-items-center rounded-full bg-[#e8f5e5] text-[#38852b]">
              <CheckCircle2 size={28} aria-hidden="true" />
            </span>
            <p className="mt-6 text-xs font-bold tracking-[0.16em] text-[#38852b] uppercase">Seat hold confirmed</p>
            <h2 id="counter-booking-title" className="mt-2 font-display text-3xl text-ink">Your seats have been held</h2>
            <p id="counter-booking-message" className="mt-4 leading-7 text-stone-600">
              Please pay {formatCurrency(booking.total_amount)} at the counter. Our team will contact you soon to confirm your booking.
            </p>
            <button
              type="button"
              autoFocus
              className="mt-7 w-full rounded-full bg-ink px-6 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              onClick={() => navigate(`/bookings/${booking.booking_reference}/confirmed`)}
            >
              View booking
            </button>
          </section>
        </div>
      )}
    </main>
  )
}

function ProgressBar({ complete, total }) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="font-bold">{complete} of {total} {total === 1 ? 'passenger' : 'passengers'} complete</span>
        {complete === total && <span className="flex items-center gap-1 font-bold text-[#38852b]"><Check size={16} /> Ready</span>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
        <div className="h-full rounded-full bg-[#38852b] transition-[width] duration-300" style={{ width: `${(complete / total) * 100}%` }} />
      </div>
    </div>
  )
}

function PassengerCard({ index, passenger, fare, errors, showErrors, onChange }) {
  const complete = Object.keys(errors).length === 0
  const visibleErrors = showErrors ? errors : {}
  const hasVisibleErrors = Object.keys(visibleErrors).length > 0
  const nameId = fieldId(passenger.seat_code, 'passenger_name')
  const ageId = fieldId(passenger.seat_code, 'age')
  const genderId = fieldId(passenger.seat_code, 'gender')

  return (
    <li className={`rounded-3xl border bg-white p-5 shadow-sm transition-colors sm:p-6 ${complete ? 'border-[#a9d79c]' : hasVisibleErrors ? 'border-red-300' : 'border-stone-200'}`}>
      <fieldset>
        <legend className="sr-only">Passenger {index + 1}, seat {passenger.seat_code}</legend>
        <div className="flex items-center gap-4">
          <span className="grid h-12 min-w-12 place-items-center rounded-2xl bg-ink px-2 font-display text-lg text-white">{passenger.seat_code}</span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">Passenger {index + 1}</p>
            <p className="text-sm text-stone-500">Seat {passenger.seat_code}{fare ? ` · ${formatCurrency(fare)}` : ''}</p>
          </div>
          <span className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${complete ? 'bg-[#e8f5e5] text-[#38852b]' : 'bg-stone-100 text-stone-500'}`}>
            {complete ? <><Check size={14} /> Done</> : 'To fill'}
          </span>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(0,1fr)_120px]">
          <FieldShell id={nameId} label="Full name" error={visibleErrors.passenger_name}>
            <input
              id={nameId}
              value={passenger.passenger_name}
              onChange={(event) => onChange('passenger_name', event.target.value)}
              autoComplete={index === 0 ? 'name' : 'off'}
              placeholder="e.g. Sita Sharma"
              aria-invalid={Boolean(visibleErrors.passenger_name)}
              aria-describedby={visibleErrors.passenger_name ? `${nameId}-error` : undefined}
              className={inputClass(visibleErrors.passenger_name)}
            />
          </FieldShell>
          <FieldShell id={ageId} label="Age" error={visibleErrors.age}>
            <input
              id={ageId}
              type="number"
              inputMode="numeric"
              min="1"
              max="120"
              value={passenger.age}
              onChange={(event) => onChange('age', event.target.value)}
              placeholder="Years"
              aria-invalid={Boolean(visibleErrors.age)}
              aria-describedby={visibleErrors.age ? `${ageId}-error` : undefined}
              className={inputClass(visibleErrors.age)}
            />
          </FieldShell>
        </div>

        <div className="mt-5" role="radiogroup" aria-labelledby={`${genderId}-label`} aria-describedby={visibleErrors.gender ? `${genderId}-error` : undefined}>
          <p id={`${genderId}-label`} className="text-xs font-bold tracking-wider text-stone-500 uppercase">Gender</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {GENDERS.map((option, optionIndex) => {
              const selected = passenger.gender === option.value
              return (
                <label key={option.value} className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm font-bold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal/40 ${selected ? 'border-ink bg-ink text-white' : visibleErrors.gender ? 'border-red-300 bg-white text-stone-600 hover:border-stone-400' : 'border-stone-300 bg-white text-stone-600 hover:border-stone-400'}`}>
                  <input
                    id={optionIndex === 0 ? genderId : undefined}
                    type="radio"
                    name={`gender-${passenger.seat_code}`}
                    value={option.value}
                    checked={selected}
                    onChange={() => onChange('gender', option.value)}
                    className="sr-only"
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
          {visibleErrors.gender && <p id={`${genderId}-error`} className="mt-1.5 text-xs font-semibold text-red-700">{visibleErrors.gender}</p>}
        </div>
      </fieldset>
    </li>
  )
}

function FieldShell({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-bold tracking-wider text-stone-500 uppercase">{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="mt-1.5 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  )
}

function inputClass(error) {
  return `mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none transition-colors placeholder:text-stone-400 focus:ring-2 ${error ? 'border-red-400 focus:ring-red-200' : 'border-stone-300 focus:border-signal focus:ring-signal/20'}`
}

function PaymentOption({ value, selected, onSelect, icon, title, description, accent }) {
  const active = selected === value
  return (
    <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-signal/40 ${active ? 'border-ink bg-canvas' : 'border-stone-200 hover:border-stone-400'}`}>
      <input type="radio" name="payment-method" value={value} checked={active} onChange={() => onSelect(value)} className="sr-only" />
      <span className={`mt-0.5 ${accent}`}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-bold">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-stone-500">{description}</span>
      </span>
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${active ? 'border-ink' : 'border-stone-300'}`} aria-hidden="true">
        {active && <span className="size-2.5 rounded-full bg-ink" />}
      </span>
    </label>
  )
}

function Countdown({ seconds, expired }) {
  const minutes = Math.floor(Math.max(seconds, 0) / 60)
  const remainder = Math.max(seconds, 0) % 60
  return <div className={`flex items-center gap-3 rounded-full px-5 py-3 font-bold tabular-nums ${expired ? 'bg-red-100 text-red-800' : seconds < 120 ? 'bg-orange-100 text-orange-800' : 'bg-stone-200 text-ink'}`}><Clock3 size={18} />{expired ? 'Hold expired' : `${minutes}:${String(remainder).padStart(2, '0')} remaining`}</div>
}

function ExpiredHold({ tripId }) {
  return <section className="py-16"><AlertTriangle className="text-signal" /><h2 className="mt-4 font-display text-3xl">Your seat hold has expired.</h2><p className="mt-2 text-stone-500">Return to the live map to choose available seats again.</p><Link to={`/trips/${tripId}`} className="mt-6 inline-block rounded-full bg-ink px-6 py-3 font-bold text-white">Choose seats again</Link></section>
}

function BookingLoadError({ error, onRetry }) {
  const isMissing = error.response?.status === 404
  return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8"><h1 className="font-display text-4xl">Booking unavailable</h1><QueryError title={isMissing ? 'This hold was not found' : 'The booking could not be loaded'} message={isMissing ? 'It may belong to another account or no longer exist.' : 'Check your connection and try again.'} onRetry={isMissing ? undefined : onRetry} /><Link to="/" className="inline-block font-bold text-signal">Return to search</Link></main>
}

function useCountdown(expiresAt) {
  const [remainingSeconds, setRemainingSeconds] = useState(expiresAt ? 600 : 0)
  useEffect(() => {
    function updateRemainingTime() {
      const remaining = expiresAt
        ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
        : 0
      setRemainingSeconds(remaining)
    }
    const firstUpdate = window.setTimeout(updateRemainingTime, 0)
    const timer = window.setInterval(updateRemainingTime, 1000)
    return () => {
      window.clearTimeout(firstUpdate)
      window.clearInterval(timer)
    }
  }, [expiresAt])
  return remainingSeconds
}

function submitGatewayForm({ form_url: formUrl, fields }) {
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = formUrl
  form.hidden = true
  Object.entries(fields).forEach(([name, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.appendChild(input)
  })
  document.body.appendChild(form)
  form.submit()
}
