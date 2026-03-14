import type {
  Tome,
  TomeWithPages,
  PageWithChallenges,
  Challenge,
  ProgressRecord,
} from '../types'

const BASE = '/api'

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: getHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  register: (username: string, password: string) =>
    req<{ message: string }>('POST', '/auth/register', { username, password }),

  login: (username: string, password: string) =>
    req<{ access_token: string; username: string }>('POST', '/auth/login', { username, password }),

  getProfile: () =>
    req<{ id: number; username: string; created_at: string }>('GET', '/user/profile'),

  getTomes: () => req<Tome[]>('GET', '/tomes'),

  getTome: (archiveKey: string) => req<TomeWithPages>('GET', `/tomes/${archiveKey}`),

  getPage: (pageId: number) => req<PageWithChallenges>('GET', `/pages/${pageId}`),

  getChallenges: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).filter((entry): entry is [string, string] => entry[1] != null && entry[1] !== '')
      )
    ).toString()
    return req<Challenge[]>('GET', `/challenges${qs ? `?${qs}` : ''}`)
  },

  getProgress: () => req<ProgressRecord[]>('GET', '/user/progress'),

  setProgress: (challengeKey: string, completed: boolean) =>
    req<{ challenge_key: string; completed: boolean }>(
      'PUT',
      `/user/progress/${challengeKey}`,
      { completed }
    ),

  // Admin
  adminGetUsers: () =>
    req<{ id: number; username: string; is_admin: boolean; created_at: string }[]>(
      'GET', '/admin/users'
    ),

  adminToggleAdmin: (userId: number) =>
    req<{ id: number; username: string; is_admin: boolean }>(
      'POST', `/admin/users/${userId}/toggle-admin`
    ),

  adminSyncCatalog: () =>
    req<{ message: string; tomes: number; pages: number; challenges: number }>(
      'POST', '/admin/sync-catalog'
    ),
}
