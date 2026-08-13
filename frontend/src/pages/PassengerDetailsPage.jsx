import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Clock3, CreditCard, ExternalLink, TicketCheck } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { confirmCounterBooking, getBooking, initiateEsewaPayment, savePassengerDetails } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { formatCurrency } from '../utils/formatters.js'
import { QueryError } from '../components/QueryError.jsx'

export function PassengerDetailsPage() {
  const { reference } = useParams()
  const bookingQuery = useQuery({ queryKey: ['booking', reference], queryFn: () => getBooking(reference), enabled: hasAccessToken() })

  if (!hasAccessToken()) return <Navigate to={`/login?next=${encodeURIComponent(`/bookings/${reference}/passengers`)}`} replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">Loading your hold…</main>
  if (bookingQuery.isError) return <BookingLoadError error={bookingQuery.error} onRetry={() => bookingQuery.refetch()} />
  return <PassengerForm key={bookingQuery.data.booking_reference} booking={bookingQuery.data} />
}

function PassengerForm({ booking }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remainingSeconds = useCountdown(booking.hold_expires_at)
  const [redirecting, setRedirecting] = useState(false)
  const [validationError, setValidationError] = useState('')
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
      navigate(`/bookings/${booking.booking_reference}/confirmed`)
    },
  })

  function updatePassenger(index, field, value) {
    setValidationError('')
    setPassengers((current) => current.map((passenger, itemIndex) => itemIndex === index ? {...passenger, [field]: value} : passenger))
  }

  function passengerPayload() {
    return passengers.map((passenger) => ({...passenger, age: Number(passenger.age)}))
  }

  function validatePassengers() {
    const invalid = passengers.some((passenger) => passenger.passenger_name.trim().length < 2 || Number(passenger.age) < 1 || Number(passenger.age) > 120 || !passenger.gender)
    if (invalid) setValidationError('Complete valid passenger details for every selected seat.')
    return !invalid
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (validatePassengers()) paymentMutation.mutate(passengerPayload())
  }

  function handleCounterBooking() {
    if (validatePassengers()) counterMutation.mutate(passengerPayload())
  }

  const expired = booking.status === 'EXPIRED' || remainingSeconds <= 0
  const apiError = (paymentMutation.error || counterMutation.error)?.response?.data
  const submitting = paymentMutation.isPending || counterMutation.isPending

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
    <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-16">
      <Link to={`/trips/${booking.trip.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-ink"><ArrowLeft size={17} /> Back to seat map</Link>
      <div className="mt-10 flex flex-wrap items-end justify-between gap-5 border-b border-stone-300 pb-8">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Booking {booking.booking_reference}</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Passenger details</h1>
          <p className="mt-3 text-stone-500">{booking.trip.route.origin} → {booking.trip.route.destination}</p>
        </div>
        <Countdown seconds={remainingSeconds} expired={expired} />
      </div>

      {expired ? <ExpiredHold tripId={booking.trip.id} /> : (
        <form onSubmit={handleSubmit} className="mt-4">
          {passengers.map((passenger, index) => (
            <fieldset key={passenger.seat_code} className="grid gap-5 border-b border-stone-200 py-8 md:grid-cols-[0.35fr_1.4fr_0.55fr_0.8fr] md:items-end">
              <legend className="sr-only">Passenger for seat {passenger.seat_code}</legend>
              <div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Seat</p><p className="mt-2 font-display text-3xl">{passenger.seat_code}</p></div>
              <Field label="Passenger name"><input value={passenger.passenger_name} onChange={(event) => updatePassenger(index, 'passenger_name', event.target.value)} autoComplete="name" className="field-input" placeholder="Full name" /></Field>
              <Field label="Age"><input type="number" min="1" max="120" value={passenger.age} onChange={(event) => updatePassenger(index, 'age', event.target.value)} className="field-input" placeholder="Age" /></Field>
              <Field label="Gender"><select value={passenger.gender} onChange={(event) => updatePassenger(index, 'gender', event.target.value)} className="field-input"><option value="">Choose</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></Field>
            </fieldset>
          ))}

          <section className="mt-10 grid gap-8 border-y border-stone-300 py-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-3"><CreditCard className="text-[#38852b]" /><h2 className="font-display text-3xl">Pay with eSewa</h2></div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">You will continue to the eSewa UAT checkout. The booking is confirmed only after Django verifies the transaction directly with eSewa.</p>
            </div>
            <div className="text-left md:text-right"><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Total</p><p className="mt-1 text-3xl font-bold">{formatCurrency(booking.total_amount)}</p></div>
          </section>

          <section className="mt-6 grid gap-5 rounded-2xl border border-orange-200 bg-orange-50 p-6 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="flex items-center gap-3"><TicketCheck className="text-signal" /><h2 className="font-display text-2xl">Reserve now, pay at counter</h2></div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-stone-600">Your seats will be booked immediately. Pay {formatCurrency(booking.total_amount)} at the bus counter before departure.</p>
            </div>
            <button type="button" onClick={handleCounterBooking} disabled={submitting} className="rounded-full border border-signal px-6 py-3 font-bold text-signal transition-colors hover:bg-signal hover:text-white disabled:opacity-50">{counterMutation.isPending ? 'Booking seats…' : 'Book without eSewa'}</button>
          </section>

          {(validationError || apiError) && <div className="mt-6 flex gap-3 text-sm font-semibold text-red-700" role="alert"><AlertTriangle size={18} className="shrink-0" /><p>{validationError || apiError.detail || 'The booking could not be completed.'}</p></div>}
          <div className="mt-8 flex justify-end"><button disabled={submitting} className="rounded-full bg-[#38852b] px-7 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">{paymentMutation.isPending ? 'Preparing eSewa…' : `Pay ${formatCurrency(booking.total_amount)} with eSewa`}</button></div>
        </form>
      )}
    </main>
  )
}

function Field({ label, children }) {
  return <label><span className="text-xs font-bold tracking-wider text-stone-500 uppercase">{label}</span>{children}</label>
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
