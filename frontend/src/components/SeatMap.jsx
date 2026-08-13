import { useMemo, useState } from 'react'
import { Armchair, CircleCheck, Clock3, X } from 'lucide-react'
import { motion } from 'framer-motion'

import { formatCurrency } from '../utils/formatters.js'

const STATUS_LABELS = {
  AVAILABLE: 'Available',
  HELD: 'Held by another customer',
  BOOKED: 'Booked',
}

const STATUS_STYLES = {
  AVAILABLE: 'border-moss/40 bg-white text-ink hover:-translate-y-0.5 hover:border-moss hover:shadow-md',
  HELD: 'border-orange-300 bg-orange-100 text-orange-900',
  BOOKED: 'border-stone-200 bg-stone-200 text-stone-400',
}

export function SeatMap({
  layout,
  seats,
  refreshedAt,
  selectedSeatCodes = [],
  onToggleSeat,
  onHold,
  isHolding = false,
  holdError,
}) {
  const [activeDeckIndex, setActiveDeckIndex] = useState(0)
  const [inspectedSeatCode, setInspectedSeatCode] = useState(null)
  const seatByCode = useMemo(
    () => new Map(seats.map((seat) => [seat.seat_code, seat])),
    [seats],
  )
  const deck = layout.decks[activeDeckIndex]
  const inspectedSeat = inspectedSeatCode ? seatByCode.get(inspectedSeatCode) : null
  const selectedSeats = selectedSeatCodes.map((code) => seatByCode.get(code)).filter(Boolean)
  const availableCount = seats.filter((seat) => seat.status === 'AVAILABLE').length

  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-t border-stone-300 pt-10"
      aria-labelledby="seat-map-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-signal uppercase">Live availability</p>
          <h2 id="seat-map-heading" className="mt-2 font-display text-3xl sm:text-4xl">Choose where you’ll sit</h2>
          <p className="mt-2 text-sm text-stone-500">Select available seats, then use the live countdown while you add passenger details.</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-moss">{availableCount}</p>
          <p className="text-xs font-semibold tracking-wider text-stone-400 uppercase">Seats available</p>
        </div>
      </div>

      <SeatLegend />

      {layout.decks.length > 1 && (
        <div className="mt-8 flex gap-2" role="tablist" aria-label="Bus decks">
          {layout.decks.map((item, index) => (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={index === activeDeckIndex}
              onClick={() => {
                setActiveDeckIndex(index)
                setInspectedSeatCode(null)
              }}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${index === activeDeckIndex ? 'bg-ink text-white' : 'bg-stone-200 text-stone-600 hover:bg-stone-300'}`}
            >
              {formatDeckName(item.name)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(320px,0.9fr)_minmax(260px,0.6fr)] lg:items-start">
        <div className="mx-auto w-full max-w-xl rounded-[2.5rem] border-2 border-stone-300 bg-stone-100 p-5 shadow-inner sm:p-8">
          <div className="mb-8 flex items-center justify-between border-b border-stone-300 pb-4 text-xs font-bold tracking-[0.14em] text-stone-400 uppercase">
            <span>{formatDeckName(deck.name)}</span>
            <span className="flex items-center gap-2"><span className="h-5 w-8 rounded-t-full border border-stone-400" /> Front</span>
          </div>

          <div
            className="grid gap-y-3"
            style={{ gridTemplateColumns: getGridColumns(deck) }}
            role="group"
            aria-label={`${formatDeckName(deck.name)} seat layout`}
          >
            {deck.seats.map((layoutSeat, index) => {
              const seat = seatByCode.get(layoutSeat.code)
              if (!seat) return null
              const isInspected = inspectedSeatCode === seat.seat_code
              const isSelected = selectedSeatCodes.includes(seat.seat_code)
              const statusLabel = isSelected ? 'Selected' : getStatusLabel(seat)
              return (
                <motion.button
                  key={seat.seat_code}
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(index * 0.018, 0.35) }}
                  onClick={() => {
                    setInspectedSeatCode(seat.seat_code)
                    if (seat.status === 'AVAILABLE') onToggleSeat?.(seat.seat_code)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setInspectedSeatCode(seat.seat_code)
                      if (seat.status === 'AVAILABLE') onToggleSeat?.(seat.seat_code)
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`${seat.seat_code}, ${statusLabel}, ${formatCurrency(seat.effective_fare)}`}
                  style={{
                    gridColumn: getDisplayColumn(layoutSeat.column, deck.aisle_after_columns),
                    gridRow: layoutSeat.row,
                  }}
                  className={`relative flex aspect-square min-h-11 items-center justify-center rounded-xl border-2 text-sm font-extrabold transition-all ${isSelected ? 'border-signal bg-signal text-white shadow-md' : STATUS_STYLES[seat.status]} ${isInspected && !isSelected ? 'ring-3 ring-signal/35 ring-offset-2' : ''}`}
                >
                  {seat.status === 'BOOKED' ? <X size={18} aria-hidden="true" /> : seat.seat_code}
                </motion.button>
              )
            })}
          </div>
        </div>

        <div className="space-y-7">
          <SeatInspector seat={inspectedSeat} refreshedAt={refreshedAt} selectedSeatCodes={selectedSeatCodes} />
          <SelectionSummary seats={selectedSeats} onHold={onHold} isHolding={isHolding} holdError={holdError} />
        </div>
      </div>
    </motion.section>
  )
}

function SeatLegend() {
  return (
    <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-stone-600" aria-label="Seat status legend">
      <LegendItem className="border-moss/40 bg-white" label="Available" />
      <LegendItem className="border-signal bg-signal" label="Selected" />
      <LegendItem className="border-orange-300 bg-orange-100" label="Held" />
      <LegendItem className="border-stone-200 bg-stone-200" label="Booked" />
    </ul>
  )
}

function LegendItem({ className, label }) {
  return <li className="flex items-center gap-2"><span className={`size-5 rounded-md border-2 ${className}`} />{label}</li>
}

function SeatInspector({ seat, refreshedAt, selectedSeatCodes }) {
  if (!seat) {
    return (
      <aside className="border-y border-stone-200 py-7 text-stone-500">
        <Armchair size={24} className="text-moss" aria-hidden="true" />
        <h3 className="mt-4 font-bold text-ink">Inspect a seat</h3>
        <p className="mt-2 text-sm leading-6">Select any seat in the diagram to check its current status and fare.</p>
        <Freshness refreshedAt={refreshedAt} />
      </aside>
    )
  }

  return (
    <aside className="border-y border-stone-200 py-7" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Seat</p>
          <h3 className="mt-1 font-display text-4xl">{seat.seat_code}</h3>
        </div>
        {seat.status === 'AVAILABLE' && <CircleCheck className="text-moss" aria-hidden="true" />}
        {seat.status === 'HELD' && <Clock3 className="text-orange-600" aria-hidden="true" />}
        {seat.status === 'BOOKED' && <X className="text-stone-400" aria-hidden="true" />}
      </div>
      <dl className="mt-6 divide-y divide-stone-200 border-t border-stone-200">
        <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-stone-500">Status</dt><dd className="text-sm font-bold">{selectedSeatCodes.includes(seat.seat_code) ? 'Selected' : getStatusLabel(seat)}</dd></div>
        <div className="flex justify-between gap-4 py-4"><dt className="text-sm text-stone-500">Fare</dt><dd className="font-bold">{formatCurrency(seat.effective_fare)}</dd></div>
      </dl>
      <Freshness refreshedAt={refreshedAt} />
    </aside>
  )
}

function SelectionSummary({ seats, onHold, isHolding, holdError }) {
  const total = seats.reduce((sum, seat) => sum + Number(seat.effective_fare), 0)
  return (
    <aside className="border-y border-stone-300 py-6" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div><p className="text-xs font-bold tracking-wider text-stone-400 uppercase">Your selection</p><p className="mt-2 font-bold">{seats.length ? seats.map((seat) => seat.seat_code).join(', ') : 'No seats selected'}</p></div>
        {seats.length > 0 && <p className="text-xl font-bold">{formatCurrency(total)}</p>}
      </div>
      {holdError && <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{holdError}</p>}
      <button type="button" disabled={!seats.length || isHolding} onClick={onHold} className="mt-5 w-full rounded-full bg-ink px-6 py-3.5 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500">
        {isHolding ? 'Holding seats…' : seats.length ? `Hold ${seats.length} seat${seats.length > 1 ? 's' : ''}` : 'Select seats to continue'}
      </button>
    </aside>
  )
}

function Freshness({ refreshedAt }) {
  return <p className="mt-6 text-xs text-stone-400">Updated {new Date(refreshedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every 15 seconds</p>
}

function getGridColumns(deck) {
  const columns = []
  for (let column = 1; column <= deck.columns; column += 1) {
    columns.push('minmax(2.75rem, 1fr)')
    if (deck.aisle_after_columns.includes(column)) columns.push('1.5rem')
  }
  return columns.join(' ')
}

function getDisplayColumn(column, aisleAfterColumns) {
  return column + aisleAfterColumns.filter((aisle) => aisle < column).length
}

function formatDeckName(value) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function getStatusLabel(seat) {
  if (seat.status === 'HELD' && seat.is_held_by_me) return 'Held for you'
  return STATUS_LABELS[seat.status]
}
