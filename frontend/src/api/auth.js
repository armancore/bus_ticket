import { apiClient, clearTokens, storeCurrentUser, storeTokens } from './client.js'

export async function login(credentials) {
  const response = await apiClient.post('/auth/token/', credentials)
  storeTokens(response.data)
  try {
    const user = await getCurrentUser()
    storeCurrentUser(user)
    return user
  } catch (error) {
    clearTokens()
    throw error
  }
}

export async function registerCustomer(data) {
  await apiClient.post('/auth/register/', data)
  return login({ username: data.username, password: data.password })
}

export function logout() {
  clearTokens()
}

export async function getCurrentUser() {
  const response = await apiClient.get('/auth/me/')
  return response.data
}
