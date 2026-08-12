import { apiClient } from './client.js'

export async function getOperatorTrips() {
  const response = await apiClient.get('/operator/trips/')
  return response.data
}

export async function createOperatorTrip(data) {
  const response = await apiClient.post('/operator/trips/', data)
  return response.data
}

export async function updateOperatorTrip({ id, data }) {
  const response = await apiClient.patch(`/operator/trips/${id}/`, data)
  return response.data
}

export async function deleteOperatorTrip(id) {
  await apiClient.delete(`/operator/trips/${id}/`)
}

export async function getOperatorBuses() {
  const response = await apiClient.get('/operator/buses/')
  return response.data
}

export async function createOperatorBus(data) {
  const response = await apiClient.post('/operator/buses/', data)
  return response.data
}

export async function updateOperatorBus({ id, data }) {
  const response = await apiClient.patch(`/operator/buses/${id}/`, data)
  return response.data
}

export async function deleteOperatorBus(id) {
  await apiClient.delete(`/operator/buses/${id}/`)
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
