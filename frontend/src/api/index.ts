'use client'
import type { Language } from '../stores/LanguageStore'
import type {
  Tome,
  TomeWithPages,
  PageWithChallenges,
  Challenge,
  ProgressRecord,
  PageDependencies,
  TomeCompletionStatus,
  PageCompletionStatus,
} from '../types'

const BASE = '/api'

function getHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(method: string, path: string, body?: unknown, lang?: Language): Promise<T> {
  const url = new URL(`${BASE}${path}`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
  if (lang) {
    url.searchParams.set('lang', lang)
  }

  const res = await fetch(url.pathname + url.search, {
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

  getPage: (pageId: number, lang?: Language) =>
    req<PageWithChallenges>('GET', `/pages/${pageId}`, undefined, lang),

  getChallenges: (params: Record<string, string | undefined> = {}, lang?: Language) => {
    const searchParams = new URLSearchParams()
    if (lang) searchParams.set('lang', lang)
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') searchParams.set(key, value)
    })
    const qs = searchParams.toString()
    return req<Challenge[]>('GET', `/challenges${qs ? '?' + qs : ''}`)
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

  // Dependencies
  getPageDependencies: (pageId: number, lang?: Language) =>
    req<PageDependencies>('GET', `/pages/${pageId}/dependencies`, undefined, lang),

  // Admin: Position & Dependencies
  adminSetChallengePosition: (challengeKey: string, gridColumn: number, gridRow: number) =>
    req<{ challenge_key: string; grid_column: number; grid_row: number }>(
      'PUT', `/admin/challenges/${challengeKey}/position`,
      { grid_column: gridColumn, grid_row: gridRow }
    ),

  adminSetChallengeDependencies: (challengeKey: string, parentKeys: string[]) =>
    req<{ challenge_key: string; parent_keys: string[] }>(
      'POST', `/admin/challenges/${challengeKey}/dependencies`,
      { parent_keys: parentKeys }
    ),

  adminAutoLayoutPage: (pageId: number) =>
    req<{ message: string; challenges_updated: number }>(
      'POST', `/admin/pages/${pageId}/auto-layout`
    ),

  // Completion status
  getTomeCompletion: (archiveKey: string) =>
    req<TomeCompletionStatus>('GET', `/user/tomes/${archiveKey}/completion`),

  getPageCompletion: (pageId: number) =>
    req<PageCompletionStatus>('GET', `/user/pages/${pageId}/completion`),
}
