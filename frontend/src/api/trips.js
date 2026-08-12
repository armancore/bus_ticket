import { apiClient } from './client.js'

export async function getRoutes() {
  const response = await apiClient.get('/routes/')
  return response.data
}

export async function searchTrips(filters) {
  const response = await apiClient.get('/trips/', { params: filters })
  return response.data
}

export async function getTrip(tripId) {
  const response = await apiClient.get(`/trips/${tripId}/`)
  return response.data
}

export async function getTripSeatMap(tripId) {
  const response = await apiClient.get(`/trips/${tripId}/seats/`)
  return response.data
}
