import { Route, Routes } from 'react-router-dom'

import { AppHeader } from './components/AppHeader.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { BookingConfirmationPage } from './pages/BookingConfirmationPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { PassengerDetailsPage } from './pages/PassengerDetailsPage.jsx'
import { TripDetailsPage } from './pages/TripDetailsPage.jsx'
import { SignupPage } from './pages/SignupPage.jsx'
import { OperatorDashboardPage } from './pages/OperatorDashboardPage.jsx'
import { AdminDashboardPage } from './pages/AdminDashboardPage.jsx'
import { MyBookingsPage } from './pages/MyBookingsPage.jsx'
import { TicketPage } from './pages/TicketPage.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <AppHeader />
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
      </Routes>
    </div>
  )
}
