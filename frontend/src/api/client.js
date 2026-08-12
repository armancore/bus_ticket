import axios from 'axios'

const ACCESS_TOKEN_KEY = 'bus_ticket_access_token'
const REFRESH_TOKEN_KEY = 'bus_ticket_refresh_token'

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10_000,
})

apiClient.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

let refreshRequest = null

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)

    if (error.response?.status !== 401 || originalRequest?._retry || !refreshToken) {
      return Promise.reject(error)
    }

    originalRequest._retry = true
    try {
      refreshRequest ??= axios.post(
        `${apiClient.defaults.baseURL}/auth/token/refresh/`,
        { refresh: refreshToken },
      )
      const { data } = await refreshRequest
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access)
      originalRequest.headers.Authorization = `Bearer ${data.access}`
      return apiClient(originalRequest)
    } catch (refreshError) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      window.dispatchEvent(new Event('auth:expired'))
      return Promise.reject(refreshError)
    } finally {
      refreshRequest = null
    }
  },
)

export function storeTokens({ access, refresh }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, access)
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}
