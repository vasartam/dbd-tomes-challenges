'use client'
import { makeAutoObservable, runInAction } from 'mobx'

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

class ProgressStore {
  completedKeys = new Set<string>()
  loaded = false

  constructor() {
    makeAutoObservable(this)
  }

  isCompleted(key: string) { return this.completedKeys.has(key) }

  async load() {
    if (this.loaded) return
    try {
      const records = await apiReq<{ challenge_key: string; completed: boolean }[]>('GET', '/user/progress')
      runInAction(() => {
        this.completedKeys = new Set(records.filter(r => r.completed).map(r => r.challenge_key))
        this.loaded = true
      })
    } catch { /* user might not be logged in yet */ }
  }

  async toggle(challengeKey: string, completed: boolean) {
    // Optimistic update
    if (completed) this.completedKeys.add(challengeKey)
    else this.completedKeys.delete(challengeKey)
    try {
      await apiReq('PUT', `/user/progress/${challengeKey}`, { completed })
    } catch (e) {
      // Revert on failure
      if (completed) this.completedKeys.delete(challengeKey)
      else this.completedKeys.add(challengeKey)
      throw e
    }
  }

  reset() {
    this.completedKeys = new Set()
    this.loaded = false
  }
}

export const progressStore = new ProgressStore()
