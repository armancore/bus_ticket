import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Armchair, BusFront, CalendarDays, Minus, Pencil, Plus, Trash2, UsersRound, X } from 'lucide-react'
import { Navigate } from 'react-router-dom'

import {
  createOperatorBus,
  createOperatorTrip,
  deleteOperatorBus,
  deleteOperatorTrip,
  getOperatorBuses,
  getOperatorTrips,
  getPassengerManifest,
  updateOperatorBus,
  updateOperatorTrip,
} from '../api/dashboards.js'
import { getRoutes } from '../api/trips.js'
import { getStoredUser } from '../api/client.js'
import { formatCurrency, formatDateHeading, formatTime } from '../utils/formatters.js'

const MIN_SEATS = 4
const MAX_SEATS = 60
const DEFAULT_SEAT_COUNT = 40

export function OperatorDashboardPage() {
  const user = getStoredUser()
  const queryClient = useQueryClient()
  const [view, setView] = useState('trips')
  const [busFormItem, setBusFormItem] = useState(undefined)
  const [tripFormItem, setTripFormItem] = useState(undefined)
  const [selectedTripId, setSelectedTripId] = useState(null)

  const enabled = user?.role === 'OPERATOR'
  const tripsQuery = useQuery({ queryKey: ['operator-trips'], queryFn: getOperatorTrips, enabled })
  const busesQuery = useQuery({ queryKey: ['operator-buses'], queryFn: getOperatorBuses, enabled })
  const routesQuery = useQuery({ queryKey: ['routes'], queryFn: getRoutes, enabled })
  const manifestQuery = useQuery({
    queryKey: ['operator-manifest', selectedTripId],
    queryFn: () => getPassengerManifest(selectedTripId),
    enabled: Boolean(selectedTripId && enabled),
  })

  const refreshTrips = () => queryClient.invalidateQueries({ queryKey: ['operator-trips'] })
  const refreshBuses = () => queryClient.invalidateQueries({ queryKey: ['operator-buses'] })
  const saveBusMutation = useMutation({
    mutationFn: ({ item, data }) => item ? updateOperatorBus({ id: item.id, data }) : createOperatorBus(data),
    onSuccess: () => { refreshBuses(); setBusFormItem(undefined) },
  })
  const deleteBusMutation = useMutation({ mutationFn: deleteOperatorBus, onSuccess: refreshBuses })
  const saveTripMutation = useMutation({
    mutationFn: ({ item, data }) => item ? updateOperatorTrip({ id: item.id, data }) : createOperatorTrip(data),
    onSuccess: () => { refreshTrips(); setTripFormItem(undefined) },
  })
  const deleteTripMutation = useMutation({
    mutationFn: deleteOperatorTrip,
    onSuccess: () => { refreshTrips(); setSelectedTripId(null) },
  })

  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'OPERATOR') return <Navigate to="/" replace />

  const openTrips = () => { setView('trips'); setBusFormItem(undefined) }
  const openFleet = () => { setView('fleet'); setTripFormItem(undefined); setSelectedTripId(null) }
  const apiError = saveBusMutation.error || deleteBusMutation.error || saveTripMutation.error || deleteTripMutation.error

  return (
    <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-stone-300 pb-8">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Operator workspace</p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl">Dispatch operations</h1>
          <p className="mt-3 text-stone-500">Manage buses, schedules, and confirmed passengers for {user.username}.</p>
        </div>
        <div className="flex gap-8 text-right">
          <Metric label="Owned buses" value={busesQuery.data?.length ?? '—'} />
          <Metric label="Trips" value={tripsQuery.data?.length ?? '—'} />
        </div>
      </header>

      <nav className="mt-7 flex gap-2 border-b border-stone-200" aria-label="Operator sections">
        <Tab active={view === 'trips'} onClick={openTrips}>Trips & manifests</Tab>
        <Tab active={view === 'fleet'} onClick={openFleet}>Bus fleet</Tab>
      </nav>

      {apiError && <DashboardError message={getApiError(apiError)} />}

      {view === 'trips' ? (
        <TripsWorkspace
          tripsQuery={tripsQuery}
          buses={busesQuery.data || []}
          routes={routesQuery.data || []}
          formItem={tripFormItem}
          setFormItem={setTripFormItem}
          saveMutation={saveTripMutation}
          deleteMutation={deleteTripMutation}
          selectedTripId={selectedTripId}
          setSelectedTripId={setSelectedTripId}
          manifestQuery={manifestQuery}
        />
      ) : (
        <FleetWorkspace
          busesQuery={busesQuery}
          formItem={busFormItem}
          setFormItem={setBusFormItem}
          saveMutation={saveBusMutation}
          deleteMutation={deleteBusMutation}
        />
      )}
    </main>
  )
}

function TripsWorkspace({ tripsQuery, buses, routes, formItem, setFormItem, saveMutation, deleteMutation, selectedTripId, setSelectedTripId, manifestQuery }) {
  const formOpen = formItem !== undefined
  return (
    <div className="mt-9 grid gap-10 xl:grid-cols-[1.05fr_0.95fr]">
      <section aria-labelledby="operator-trips-heading">
        <SectionHeading icon={CalendarDays} title="Scheduled trips" action="New trip" onAction={() => setFormItem(null)} />
        {tripsQuery.isPending && <Loading label="Loading trips…" />}
        {tripsQuery.isError && <DashboardError message="Your trips could not be loaded." />}
        <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
          {tripsQuery.data?.map((trip) => (
            <article key={trip.id} className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3"><Status value={trip.status} /><p className="font-bold">{trip.route.origin} → {trip.route.destination}</p></div>
                  <p className="mt-2 text-sm text-stone-500">{formatDateHeading(trip.departure_datetime.slice(0, 10))}, {formatTime(trip.departure_datetime)} · {trip.bus.name}</p>
                  <p className="mt-1 text-sm font-semibold">{formatCurrency(trip.base_fare)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <SmallButton onClick={() => { setSelectedTripId(trip.id); setFormItem(undefined) }}><UsersRound size={15} /> Manifest</SmallButton>
                  <SmallButton onClick={() => { setFormItem(trip); setSelectedTripId(null) }}><Pencil size={15} /> Edit</SmallButton>
                  <SmallButton danger onClick={() => confirmDelete('trip', () => deleteMutation.mutate(trip.id))}><Trash2 size={15} /> Delete</SmallButton>
                </div>
              </div>
            </article>
          ))}
        </div>
        {tripsQuery.data?.length === 0 && <Empty label="No trips yet. Create the first schedule for one of your buses." />}
      </section>

      <section aria-live="polite">
        {formOpen && <TripForm key={formItem?.id || 'new'} item={formItem} buses={buses} routes={routes} onClose={() => setFormItem(undefined)} onSave={(data) => saveMutation.mutateAsync({ item: formItem, data })} saving={saveMutation.isPending} />}
        {!formOpen && selectedTripId && <ManifestPanel query={manifestQuery} />}
        {!formOpen && !selectedTripId && <WorkspaceHint icon={UsersRound} title="Select a task" text="Open a passenger manifest, edit a schedule, or create a new trip." />}
      </section>
    </div>
  )
}

function FleetWorkspace({ busesQuery, formItem, setFormItem, saveMutation, deleteMutation }) {
  const formOpen = formItem !== undefined
  return (
    <div className="mt-9 grid gap-10 xl:grid-cols-[1.05fr_0.95fr]">
      <section aria-labelledby="fleet-heading">
        <SectionHeading icon={BusFront} title="Owned buses" action="Add bus" onAction={() => setFormItem(null)} />
        {busesQuery.isPending && <Loading label="Loading buses…" />}
        {busesQuery.isError && <DashboardError message="Your fleet could not be loaded." />}
        <div className="mt-5 divide-y divide-stone-200 border-y border-stone-200">
          {busesQuery.data?.map((bus) => (
            <article key={bus.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div><p className="font-bold">{bus.name}</p><p className="mt-1 text-sm text-stone-500">{bus.plate_number} · {bus.bus_type} · {bus.seat_count} seats</p></div>
              <div className="flex gap-2">
                <SmallButton onClick={() => setFormItem(bus)}><Pencil size={15} /> Edit</SmallButton>
                <SmallButton danger onClick={() => confirmDelete('bus', () => deleteMutation.mutate(bus.id))}><Trash2 size={15} /> Delete</SmallButton>
              </div>
            </article>
          ))}
        </div>
        {busesQuery.data?.length === 0 && <Empty label="No buses yet. Add a bus before creating a trip." />}
      </section>
      <section>{formOpen ? <BusForm key={formItem?.id || 'new'} item={formItem} onClose={() => setFormItem(undefined)} onSave={(data) => saveMutation.mutateAsync({ item: formItem, data })} saving={saveMutation.isPending} /> : <WorkspaceHint icon={BusFront} title="Fleet details" text="Add a bus by choosing its seat count. Every row is arranged as two seats, an aisle, and two seats." />}</section>
    </div>
  )
}

function BusForm({ item, onClose, onSave, saving }) {
  const [form, setForm] = useState({ name: item?.name || '', plate_number: item?.plate_number || '', bus_type: item?.bus_type || '', seat_count: item?.seat_count || DEFAULT_SEAT_COUNT })
  const changeSeatCount = (amount) => setForm((current) => ({ ...current, seat_count: Math.min(MAX_SEATS, Math.max(MIN_SEATS, Number(current.seat_count) + amount)) }))
  const submit = (event) => { event.preventDefault(); return onSave({ ...form, seat_count: Number(form.seat_count) }) }
  return (
    <Editor title={item ? 'Edit bus' : 'Add a bus'} onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Bus name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Plate number"><input required value={form.plate_number} onChange={(event) => setForm({ ...form, plate_number: event.target.value })} /></Field><Field label="Bus type"><input required value={form.bus_type} onChange={(event) => setForm({ ...form, bus_type: event.target.value })} /></Field></div>
        <div className="border-y border-stone-300 py-5">
          <div className="flex items-end justify-between gap-5">
            <div><p className="text-sm font-bold text-stone-700">Number of seats</p><p className="mt-1 text-xs leading-5 text-stone-500">Four seats per row: two left and two right.</p></div>
            <div className="flex items-center gap-3" aria-label="Choose number of seats">
              <button type="button" onClick={() => changeSeatCount(-4)} disabled={form.seat_count <= MIN_SEATS} aria-label="Remove four seats" className="rounded-full border border-stone-300 p-2 text-stone-600 disabled:opacity-30"><Minus size={16} /></button>
              <output className="min-w-12 text-center font-display text-3xl" aria-live="polite">{form.seat_count}</output>
              <button type="button" onClick={() => changeSeatCount(4)} disabled={form.seat_count >= MAX_SEATS} aria-label="Add four seats" className="rounded-full border border-stone-300 p-2 text-stone-600 disabled:opacity-30"><Plus size={16} /></button>
            </div>
          </div>
          <SeatLayoutPreview seatCount={Number(form.seat_count)} />
        </div>
        <SubmitButton saving={saving} label={item ? 'Save bus' : 'Add bus'} />
      </form>
    </Editor>
  )
}

function SeatLayoutPreview({ seatCount }) {
  const rows = Array.from({ length: seatCount / 4 }, (_, index) => index + 1)
  return (
    <div className="mt-5 max-h-72 overflow-y-auto rounded-[2rem] border-2 border-stone-300 bg-stone-100 p-4" aria-label={`${seatCount} seat bus layout preview`}>
      <div className="mb-4 flex items-center justify-between border-b border-stone-300 pb-3 text-[10px] font-bold tracking-wider text-stone-400 uppercase"><span>2 + 2 layout</span><span>Front</span></div>
      <div className="mx-auto grid max-w-64 grid-cols-[1fr_1fr_1.25rem_1fr_1fr] gap-2">
        {rows.flatMap((row) => [1, 2, 3, 4].map((seat) => (
          <span key={`${row}-${seat}`} style={{ gridColumn: seat > 2 ? seat + 1 : seat }} className="flex aspect-square items-center justify-center rounded-lg border border-moss/30 bg-white text-[10px] font-bold text-moss" title={`Seat ${String.fromCharCode(64 + row)}${seat}`}>
            <Armchair size={14} aria-hidden="true" />
          </span>
        )))}
      </div>
    </div>
  )
}

function TripForm({ item, buses, routes, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    bus_id: item?.bus.id || buses[0]?.id || '',
    route_id: item?.route.id || routes[0]?.id || '',
    departure_datetime: toDateTimeInput(item?.departure_datetime),
    arrival_datetime: toDateTimeInput(item?.arrival_datetime),
    base_fare: item?.base_fare || '',
    status: item?.status || 'SCHEDULED',
  })
  const submit = (event) => { event.preventDefault(); return onSave(form) }
  return (
    <Editor title={item ? 'Edit trip' : 'Create a trip'} onClose={onClose}>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <Field label="Bus" help={item ? 'The bus is locked after seat inventory is generated.' : ''}><select required disabled={Boolean(item)} value={form.bus_id} onChange={(event) => setForm({ ...form, bus_id: event.target.value })}>{buses.map((bus) => <option key={bus.id} value={bus.id}>{bus.name} · {bus.plate_number}</option>)}</select></Field>
        <Field label="Route"><select required value={form.route_id} onChange={(event) => setForm({ ...form, route_id: event.target.value })}>{routes.map((route) => <option key={route.id} value={route.id}>{route.origin} → {route.destination}</option>)}</select></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Departure"><input required type="datetime-local" value={form.departure_datetime} onChange={(event) => setForm({ ...form, departure_datetime: event.target.value })} /></Field><Field label="Arrival"><input required type="datetime-local" value={form.arrival_datetime} onChange={(event) => setForm({ ...form, arrival_datetime: event.target.value })} /></Field></div>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Base fare (NPR)"><input required min="0" step="0.01" type="number" value={form.base_fare} onChange={(event) => setForm({ ...form, base_fare: event.target.value })} /></Field><Field label="Status"><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="SCHEDULED">Scheduled</option><option value="DEPARTED">Departed</option><option value="CANCELLED">Cancelled</option></select></Field></div>
        {(!buses.length || !routes.length) && <p className="text-sm font-semibold text-red-700" role="alert">A bus and an existing route are required before creating a trip.</p>}
        <SubmitButton saving={saving} disabled={!buses.length || !routes.length} label={item ? 'Save trip' : 'Create trip'} />
      </form>
    </Editor>
  )
}

function ManifestPanel({ query }) {
  if (query.isPending) return <Loading label="Loading passenger manifest…" />
  if (query.isError) return <DashboardError message="The passenger manifest could not be loaded." />
  const passengers = query.data?.passengers || []
  return (
    <div>
      <div className="flex items-end justify-between border-b border-stone-300 pb-5"><div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Passenger manifest</p><h2 className="mt-2 font-display text-3xl">{query.data.trip.route.origin} → {query.data.trip.route.destination}</h2></div><p className="text-3xl font-bold">{query.data.passenger_count}</p></div>
      {!passengers.length ? <Empty label="No confirmed passengers yet." /> : <div className="overflow-x-auto"><table className="mt-4 w-full min-w-xl text-left text-sm"><thead className="border-b border-stone-300 text-xs tracking-wider text-stone-400 uppercase"><tr><th className="py-3">Seat</th><th>Passenger</th><th>Age / gender</th><th>Reference</th><th className="text-right">Fare</th></tr></thead><tbody className="divide-y divide-stone-200">{passengers.map((passenger) => <tr key={`${passenger.booking_reference}-${passenger.seat_code}`}><td className="py-4 font-bold">{passenger.seat_code}</td><td>{passenger.passenger_name}</td><td>{passenger.age} · {passenger.gender}</td><td className="font-mono text-xs">{passenger.booking_reference}</td><td className="text-right font-semibold">{formatCurrency(passenger.fare_charged)}</td></tr>)}</tbody></table></div>}
    </div>
  )
}

function Editor({ title, onClose, children }) { return <div className="border-l-2 border-moss pl-6 sm:pl-8"><div className="flex items-center justify-between"><h2 className="font-display text-3xl">{title}</h2><button type="button" onClick={onClose} aria-label="Close form" className="rounded-full p-2 text-stone-500 hover:bg-stone-200"><X size={19} /></button></div>{children}</div> }
function Field({ label, help, children }) { return <label className="block text-sm font-bold text-stone-700">{label}{help && <span className="mt-1 block text-xs font-normal leading-5 text-stone-500">{help}</span>}<span className="mt-2 block [&>input]:w-full [&>select]:w-full [&>textarea]:w-full">{children}</span></label> }
function SubmitButton({ saving, disabled, label }) { return <button disabled={saving || disabled} className="rounded-full bg-ink px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Saving…' : label}</button> }
function SectionHeading({ icon: Icon, title, action, onAction }) { return <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Icon className="text-moss" /><h2 className="font-display text-3xl" id={title === 'Owned buses' ? 'fleet-heading' : 'operator-trips-heading'}>{title}</h2></div><button type="button" onClick={onAction} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} />{action}</button></div> }
function Tab({ active, onClick, children }) { return <button type="button" onClick={onClick} className={`border-b-2 px-4 py-3 text-sm font-bold transition-colors ${active ? 'border-signal text-ink' : 'border-transparent text-stone-500 hover:text-ink'}`}>{children}</button> }
function SmallButton({ danger, onClick, children }) { return <button type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold ${danger ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-stone-300 text-stone-600 hover:bg-stone-100'}`}>{children}</button> }
function Status({ value }) { const styles = { SCHEDULED: 'bg-green-100 text-green-800', DEPARTED: 'bg-stone-200 text-stone-600', CANCELLED: 'bg-red-100 text-red-800' }; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wider ${styles[value]}`}>{value}</span> }
function Metric({ label, value }) { return <div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">{label}</p><p className="mt-1 font-display text-3xl">{value}</p></div> }
function Loading({ label }) { return <p className="mt-6 text-stone-500">{label}</p> }
function Empty({ label }) { return <p className="mt-6 border-y border-stone-200 py-8 text-stone-500">{label}</p> }
function WorkspaceHint({ icon: Icon, title, text }) { return <div className="border-y border-stone-200 py-12"><Icon className="text-moss" /><h2 className="mt-4 font-display text-3xl">{title}</h2><p className="mt-2 max-w-md text-stone-500">{text}</p></div> }
function DashboardError({ message }) { return <p className="mt-6 text-sm font-semibold text-red-700" role="alert">{message}</p> }
function toDateTimeInput(value) { return value ? value.slice(0, 16) : '' }
function confirmDelete(kind, action) { if (window.confirm(`Delete this ${kind}? This cannot be undone.`)) action() }
function getApiError(error) { const data = error.response?.data; if (!data) return 'The server could not complete that action.'; if (typeof data.detail === 'string') return data.detail; const first = Object.values(data).flat()[0]; return typeof first === 'string' ? first : 'Please check the form and try again.' }
