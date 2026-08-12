import { Route, Routes } from 'react-router-dom'

import { AppHeader } from './components/AppHeader.jsx'
import { SearchPage } from './pages/SearchPage.jsx'
import { TripDetailsPage } from './pages/TripDetailsPage.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <AppHeader />
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/trips/:tripId" element={<TripDetailsPage />} />
      </Routes>
    </div>
  )
}
