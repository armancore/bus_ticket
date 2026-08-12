import { apiClient } from './client.js'

export async function getOperatorTrips() {
  const response = await apiClient.get('/operator/trips/')
  return response.data
}

export async function getPassengerManifest(tripId) {
  const response = await apiClient.get(`/operator/trips/${tripId}/manifest/`)
  return response.data
}

export async function getAdminSummary() {
  const response = await apiClient.get('/bookings/admin/summary/')
  return response.data
}

export async function getAdminBookings() {
  const response = await apiClient.get('/bookings/admin/all/')
  return response.data
}
