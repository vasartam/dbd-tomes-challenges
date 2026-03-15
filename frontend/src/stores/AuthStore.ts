'use client'
import { makeAutoObservable, runInAction } from 'mobx'

interface User {
  id: number
  username: string
  is_admin?: boolean | number
  created_at?: string
}

async function apiReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
  return data as T
}

class AuthStore {
  user: User | null = null
  loading = true

  constructor() {
    makeAutoObservable(this)
    this.init()
  }

  async init() {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) { runInAction(() => { this.loading = false }); return }
    try {
      const profile = await apiReq<User>('GET', '/user/profile')
      runInAction(() => { this.user = profile })
    } catch {
      if (typeof window !== 'undefined') localStorage.removeItem('access_token')
    } finally {
      runInAction(() => { this.loading = false })
    }
  }

  get isAuthenticated() { return !!this.user }
  get isAdmin() { return Boolean(this.user?.is_admin) }

  async login(username: string, password: string) {
    const data = await apiReq<{ access_token: string; username: string }>('POST', '/auth/login', { username, password })
    if (typeof window !== 'undefined') localStorage.setItem('access_token', data.access_token)
    const profile = await apiReq<User>('GET', '/user/profile')
    runInAction(() => { this.user = profile })
  }

  async register(username: string, password: string) {
    await apiReq('POST', '/auth/register', { username, password })
    await this.login(username, password)
  }

  logout() {
    if (typeof window !== 'undefined') localStorage.removeItem('access_token')
    runInAction(() => { this.user = null })
  }
}

export const authStore = new AuthStore()
