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

export async function confirmBooking({ reference, passengers, simulatePaymentSuccess }) {
  const response = await apiClient.post(`/bookings/${reference}/confirm/`, {
    passengers,
    simulate_payment_success: simulatePaymentSuccess,
  })
  return response.data
}

export async function cancelBooking(reference) {
  const response = await apiClient.post(`/bookings/${reference}/cancel/`)
  return response.data
}
