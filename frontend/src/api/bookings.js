import { apiClient } from './client.js'

export async function holdSeats({ tripId, seatCodes }) {
  const response = await apiClient.post('/bookings/hold/', {
    trip_id: tripId,
    seat_codes: seatCodes,
  })
  return response.data
}

export async function getBooking(reference) {
  const response = await apiClient.get(`/bookings/${reference}/`)
  return response.data
}

export async function getMyBookings() {
  const response = await apiClient.get('/bookings/')
  return response.data
}

export async function savePassengerDetails({ reference, passengers }) {
  const response = await apiClient.post(`/bookings/${reference}/passengers/`, {
    passengers,
  })
  return response.data
}

export async function initiateEsewaPayment(bookingId) {
  const response = await apiClient.post('/payments/esewa/initiate/', {
    booking_id: bookingId,
  })
  return response.data
}

export async function confirmCounterBooking(reference) {
  const response = await apiClient.post(`/bookings/${reference}/confirm-counter/`)
  return response.data
}

export async function cancelBooking(reference) {
  const response = await apiClient.post(`/bookings/${reference}/cancel/`)
  return response.data
}
