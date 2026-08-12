import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Clock3, CreditCard } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { confirmBooking, getBooking } from '../api/bookings.js'
import { hasAccessToken } from '../api/client.js'
import { formatCurrency } from '../utils/formatters.js'

export function PassengerDetailsPage() {
  const { reference } = useParams()
  const bookingQuery = useQuery({ queryKey: ['booking', reference], queryFn: () => getBooking(reference), enabled: hasAccessToken() })

  if (!hasAccessToken()) return <Navigate to={`/login?next=${encodeURIComponent(`/bookings/${reference}/passengers`)}`} replace />
  if (bookingQuery.isPending) return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8">Loading your hold…</main>
  if (bookingQuery.isError) return <BookingLoadError />
  return <PassengerForm key={bookingQuery.data.booking_reference} booking={bookingQuery.data} />
}

function PassengerForm({ booking }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const remainingSeconds = useCountdown(booking.hold_expires_at)
  const [simulateFailure, setSimulateFailure] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [passengers, setPassengers] = useState(() => booking.seats.map((seat) => ({
    seat_code: seat.seat_code,
    passenger_name: '',
    age: '',
    gender: '',
  })))

  const confirmMutation = useMutation({
    mutationFn: confirmBooking,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trip-seat-map', String(booking.trip.id)] })
      navigate(`/bookings/${booking.booking_reference}/confirmed`)
    },
  })

  function updatePassenger(index, field, value) {
    setValidationError('')
    setPassengers((current) => current.map((passenger, itemIndex) => itemIndex === index ? {...passenger, [field]: value} : passenger))
  }

  function handleSubmit(event) {
    event.preventDefault()
    const invalid = passengers.some((passenger) => passenger.passenger_name.trim().length < 2 || Number(passenger.age) < 1 || Number(passenger.age) > 120 || !passenger.gender)
    if (invalid) {
      setValidationError('Complete valid passenger details for every selected seat.')
      return
    }
    confirmMutation.mutate({
      reference: booking.booking_reference,
      passengers: passengers.map((passenger) => ({...passenger, age: Number(passenger.age)})),
      simulatePaymentSuccess: !simulateFailure,
    })
  }

  const expired = booking.status === 'EXPIRED' || remainingSeconds <= 0
  const apiError = confirmMutation.error?.response?.data

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
              <div className="flex items-center gap-3"><CreditCard className="text-moss" /><h2 className="font-display text-3xl">Mock payment</h2></div>
              <p className="mt-3 max-w-xl text-sm leading-6 text-stone-500">No real payment details are collected. Confirmation creates a local successful payment record.</p>
              <label className="mt-4 flex items-center gap-3 text-sm text-stone-500"><input type="checkbox" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} className="size-4 accent-orange-600" /> Simulate a failed payment for testing</label>
            </div>
            <div className="text-left md:text-right"><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Total</p><p className="mt-1 text-3xl font-bold">{formatCurrency(booking.total_amount)}</p></div>
          </section>

          {(validationError || apiError) && <div className="mt-6 flex gap-3 text-sm font-semibold text-red-700" role="alert"><AlertTriangle size={18} className="shrink-0" /><p>{validationError || apiError.detail || 'Confirmation failed.'}</p></div>}
          <div className="mt-8 flex justify-end"><button disabled={confirmMutation.isPending} className="rounded-full bg-signal px-7 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50">{confirmMutation.isPending ? 'Processing…' : `Pay ${formatCurrency(booking.total_amount)} & confirm`}</button></div>
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

function BookingLoadError() {
  return <main className="mx-auto max-w-5xl px-5 py-16 sm:px-8"><h1 className="font-display text-4xl">Booking unavailable</h1><p className="mt-3 text-stone-500">This booking may belong to another account or no longer exist.</p><Link to="/" className="mt-6 inline-block font-bold text-signal">Return to search</Link></main>
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
