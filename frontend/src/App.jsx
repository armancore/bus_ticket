import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'

import { AppHeader } from './components/AppHeader.jsx'

const SearchPage = lazyPage(() => import('./pages/SearchPage.jsx'), 'SearchPage')
const BookingConfirmationPage = lazyPage(() => import('./pages/BookingConfirmationPage.jsx'), 'BookingConfirmationPage')
const LoginPage = lazyPage(() => import('./pages/LoginPage.jsx'), 'LoginPage')
const PassengerDetailsPage = lazyPage(() => import('./pages/PassengerDetailsPage.jsx'), 'PassengerDetailsPage')
const TripDetailsPage = lazyPage(() => import('./pages/TripDetailsPage.jsx'), 'TripDetailsPage')
const SignupPage = lazyPage(() => import('./pages/SignupPage.jsx'), 'SignupPage')
const OperatorDashboardPage = lazyPage(() => import('./pages/OperatorDashboardPage.jsx'), 'OperatorDashboardPage')
const AdminDashboardPage = lazyPage(() => import('./pages/AdminDashboardPage.jsx'), 'AdminDashboardPage')
const MyBookingsPage = lazyPage(() => import('./pages/MyBookingsPage.jsx'), 'MyBookingsPage')
const TicketPage = lazyPage(() => import('./pages/TicketPage.jsx'), 'TicketPage')
const NotFoundPage = lazyPage(() => import('./pages/NotFoundPage.jsx'), 'NotFoundPage')
const PaymentSuccessPage = lazyPage(() => import('./pages/PaymentSuccessPage.jsx'), 'PaymentSuccessPage')
const PaymentFailurePage = lazyPage(() => import('./pages/PaymentFailurePage.jsx'), 'PaymentFailurePage')

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <AppHeader />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/operator" element={<OperatorDashboardPage />} />
          <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
          <Route path="/bookings" element={<MyBookingsPage />} />
          <Route path="/trips/:tripId" element={<TripDetailsPage />} />
          <Route path="/bookings/:reference/passengers" element={<PassengerDetailsPage />} />
          <Route path="/bookings/:reference/confirmed" element={<BookingConfirmationPage />} />
          <Route path="/tickets/:reference" element={<TicketPage />} />
          <Route path="/payment/success" element={<PaymentSuccessPage />} />
          <Route path="/payment/failure" element={<PaymentFailurePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </div>
  )
}

function lazyPage(importPage, exportName) {
  return lazy(() => importPage().then((module) => ({ default: module[exportName] })))
}

function PageLoading() {
  return <main className="mx-auto max-w-7xl px-5 py-16 text-stone-500 sm:px-8" role="status">Loading page…</main>
}
