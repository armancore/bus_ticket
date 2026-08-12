import { Route, Routes } from 'react-router-dom'

import { AppHeader } from './components/AppHeader.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { BookingConfirmationPage } from './pages/BookingConfirmationPage.jsx'
import { LoginPage } from './pages/LoginPage.jsx'
import { PassengerDetailsPage } from './pages/PassengerDetailsPage.jsx'
import { TripDetailsPage } from './pages/TripDetailsPage.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <AppHeader />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/trips/:tripId" element={<TripDetailsPage />} />
        <Route path="/bookings/:reference/passengers" element={<PassengerDetailsPage />} />
        <Route path="/bookings/:reference/confirmed" element={<BookingConfirmationPage />} />
      </Routes>
    </div>
  )
}
