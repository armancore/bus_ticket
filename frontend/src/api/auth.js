import { apiClient, clearTokens, storeTokens } from './client.js'

export async function login(credentials) {
  const response = await apiClient.post('/auth/token/', credentials)
  storeTokens(response.data)
  try {
    return await getCurrentUser()
  } catch (error) {
    clearTokens()
    throw error
  }
}

export async function getCurrentUser() {
  const response = await apiClient.get('/auth/me/')
  return response.data
}
