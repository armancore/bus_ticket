const timeFormatter = new Intl.DateTimeFormat('en-NP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const currencyFormatter = new Intl.NumberFormat('en-NP', {
  style: 'currency',
  currency: 'NPR',
  maximumFractionDigits: 0,
})

export function formatTime(value) {
  return timeFormatter.format(new Date(value))
}

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value))
}

export function formatDuration(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return `${hours}h${minutes ? ` ${minutes}m` : ''}`
}

export function formatDateHeading(value) {
  return new Intl.DateTimeFormat('en-NP', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}

export function tomorrowISO() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toLocaleDateString('en-CA')
}
