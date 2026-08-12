import { AlertCircle } from 'lucide-react'

export function QueryError({ title, message, onRetry, className = '' }) {
  return (
    <div className={`flex items-start gap-3 py-8 ${className}`} role="alert">
      <AlertCircle className="mt-0.5 shrink-0 text-signal" size={20} aria-hidden="true" />
      <div>
        <p className="font-bold">{title}</p>
        {message && <p className="mt-1 text-sm text-stone-500">{message}</p>}
        {onRetry && <button type="button" onClick={onRetry} className="mt-3 text-sm font-bold text-signal underline underline-offset-4">Try again</button>}
      </div>
    </div>
  )
}
