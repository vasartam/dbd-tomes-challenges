'use client'
import { makeAutoObservable, runInAction } from 'mobx'
import type { Tome, TomeWithPages, PageWithChallenges, PageDependencies, PageCompletionStatus, Challenge } from '../types'
import { langStore } from './LanguageStore'

function getToken() {
  return typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
}

async function apiReq<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
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

class CatalogStore {
  tomes: Tome[] = []
  tomesLoaded = false
  tomeDetails = new Map<string, TomeWithPages>()
  // key: `${pageId}_${lang}` — language-aware cache
  pages = new Map<string, PageWithChallenges>()
  deps = new Map<string, PageDependencies>()
  pageCompletion = new Map<number, PageCompletionStatus>()

  constructor() {
    makeAutoObservable(this)
  }

  private pageKey(pageId: number) {
    return `${pageId}_${langStore.lang}`
  }

  async loadTomes() {
    if (this.tomesLoaded) return
    const data = await apiReq<Tome[]>('GET', '/tomes')
    runInAction(() => { this.tomes = data; this.tomesLoaded = true })
  }

  async loadTome(archiveKey: string): Promise<TomeWithPages> {
    if (this.tomeDetails.has(archiveKey)) return this.tomeDetails.get(archiveKey)!
    const data = await apiReq<TomeWithPages>('GET', `/tomes/${archiveKey}`)
    runInAction(() => { this.tomeDetails.set(archiveKey, data) })
    return data
  }

  async loadPage(pageId: number): Promise<PageWithChallenges> {
    const key = this.pageKey(pageId)
    if (this.pages.has(key)) return this.pages.get(key)!
    const data = await apiReq<PageWithChallenges>('GET', `/pages/${pageId}?lang=${langStore.lang}`)
    runInAction(() => { this.pages.set(key, data) })
    return data
  }

  async loadPageDeps(pageId: number): Promise<PageDependencies> {
    const key = this.pageKey(pageId)
    if (this.deps.has(key)) return this.deps.get(key)!
    const data = await apiReq<PageDependencies>('GET', `/pages/${pageId}/dependencies?lang=${langStore.lang}`)
    runInAction(() => { this.deps.set(key, data) })
    return data
  }

  async loadBulkDeps(pageIds: number[]): Promise<void> {
    const lang = langStore.lang
    const missing = pageIds.filter(id => !this.deps.has(`${id}_${lang}`))
    if (missing.length === 0) return
    const data = await apiReq<Record<string, PageDependencies>>(
      'GET',
      `/dependencies?page_ids=${missing.join(',')}&lang=${lang}`
    )
    runInAction(() => {
      for (const [pageIdStr, deps] of Object.entries(data)) {
        this.deps.set(`${pageIdStr}_${lang}`, deps)
      }
    })
  }

  async loadPageCompletion(pageId: number): Promise<PageCompletionStatus> {
    if (this.pageCompletion.has(pageId)) return this.pageCompletion.get(pageId)!
    const data = await apiReq<PageCompletionStatus>('GET', `/user/pages/${pageId}/completion`)
    runInAction(() => { this.pageCompletion.set(pageId, data) })
    return data
  }

  async refreshPageCompletion(pageId: number): Promise<PageCompletionStatus> {
    const data = await apiReq<PageCompletionStatus>('GET', `/user/pages/${pageId}/completion`)
    runInAction(() => { this.pageCompletion.set(pageId, data) })
    return data
  }

  async searchChallenges(params: Record<string, string | undefined>): Promise<Challenge[]> {
    const searchParams = new URLSearchParams({ lang: langStore.lang })
    for (const [k, v] of Object.entries(params)) {
      if (v) searchParams.set(k, v)
    }
    return apiReq<Challenge[]>('GET', `/challenges?${searchParams.toString()}`)
  }

  // Invalidate language-dependent caches when language changes
  clearLangCache() {
    this.pages.clear()
    this.deps.clear()
  }

  reset() {
    this.tomes = []
    this.tomesLoaded = false
    this.tomeDetails.clear()
    this.pages.clear()
    this.deps.clear()
    this.pageCompletion.clear()
  }
}

export const catalogStore = new CatalogStore()
