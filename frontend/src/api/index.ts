import type { Language } from '../contexts/LanguageContext'
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
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(method: string, path: string, body?: unknown, lang?: Language): Promise<T> {
  // Добавляем язык в query params
  const url = new URL(`${BASE}${path}`, window.location.origin)
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

function getInitialLang(): Language {
  const stored = localStorage.getItem('app_language')
  if (stored === 'en' || stored === 'ru') return stored as Language
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

let currentLang: Language = getInitialLang()

export function setApiLanguage(lang: Language) {
  currentLang = lang
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

  getPage: (pageId: number) => req<PageWithChallenges>('GET', `/pages/${pageId}`, undefined, currentLang),

  getChallenges: (params: Record<string, string | undefined> = {}) => {
    const url = new URL('/challenges', window.location.origin)
    url.searchParams.set('lang', currentLang)
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && value !== '') {
        url.searchParams.set(key, value)
      }
    })
    return req<Challenge[]>('GET', url.pathname + url.search)
  },

  getProgress: () => req<ProgressRecord[]>('GET', '/user/progress', undefined, currentLang),

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
    req<PageDependencies>('GET', `/pages/${pageId}/dependencies`, undefined, lang ?? currentLang),

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
