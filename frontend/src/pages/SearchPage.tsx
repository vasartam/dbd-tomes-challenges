'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  PanelHeader,
  Group,
  Search,
  Spinner,
  Div,
  SegmentedControl,
  Text,
  Header,
  Snackbar,
} from '@vkontakte/vkui'
import { Icon28CancelCircleOutline } from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { useSearchParams } from 'next/navigation'
import { catalogStore, progressStore, langStore } from '../stores'
import { getNodeType } from '../types'
import ChallengeCard from '../components/ChallengeCard'
import type { Challenge } from '../types'

const MAX_VISIBLE = 50

export default observer(function SearchPage() {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const lang = langStore.lang

  const searchParams = useSearchParams()

  const [query, setQuery] = useState(() => searchParams?.get('q') ?? '')
  const [role, setRole] = useState(() => searchParams?.get('role') ?? '')
  const [statusFilter, setStatusFilter] = useState(() => searchParams?.get('status') ?? 'all')
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(false)
  const [depsLoading, setDepsLoading] = useState(false)
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)
  const depsLoadedForRef = useRef<string>('')

  const ROLE_OPTIONS = [
    { label: t('search.filters.allRoles'), value: '' },
    { label: t('challenge.survivor'), value: 'survivor' },
    { label: t('challenge.killer'), value: 'killer' },
    { label: t('challenge.shared'), value: 'shared' },
  ]

  const STATUS_OPTIONS = [
    { label: t('search.filters.all'), value: 'all' },
    { label: t('search.filters.available'), value: 'available' },
    { label: t('search.filters.completed'), value: 'completed' },
  ]

  const showError = (msg: string) => {
    setSnackbar(
      <Snackbar
        onClose={() => setSnackbar(null)}
        before={<Icon28CancelCircleOutline fill="var(--vkui--color_icon_negative)" />}
      >
        {msg}
      </Snackbar>
    )
  }

  // Синхронизируем параметры в URL без перезагрузки страницы
  useEffect(() => {
    const params = new URLSearchParams()
    if (query)                  params.set('q', query)
    if (role)                   params.set('role', role)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/search?${qs}` : '/search')
  }, [query, role, statusFilter])

  const doSearch = useCallback(() => {
    setLoading(true)
    catalogStore.searchChallenges({
      q: query || undefined,
      role: role || undefined,
    })
      .then(setChallenges)
      .catch(err => showError((err as Error).message))
      .finally(() => setLoading(false))
  }, [query, role, lang])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  useEffect(() => {
    progressStore.load()
  }, [])

  // Подгружаем deps страниц при фильтре "available"
  useEffect(() => {
    if (statusFilter !== 'available' || challenges.length === 0) return
    const uniquePageIds = [...new Set(challenges.map(c => c.page_id))]
    const cacheKey = uniquePageIds.sort().join(',')
    if (depsLoadedForRef.current === cacheKey) return
    setDepsLoading(true)
    Promise.all(
      uniquePageIds.map(pid => Promise.all([
        catalogStore.loadPageDeps(pid),
        catalogStore.loadPage(pid),
      ]))
    ).finally(() => {
      depsLoadedForRef.current = cacheKey
      setDepsLoading(false)
    })
  }, [challenges, statusFilter])

  const isActuallyAvailable = (challenge: Challenge): boolean => {
    if (progressStore.isCompleted(challenge.challenge_key)) return false
    const key = `${challenge.page_id}_${lang}`
    const deps = catalogStore.deps.get(key)

    if (deps && deps.challenges.length > 0) {
      const info = deps.challenges.find(c => c.challenge_key === challenge.challenge_key)
      if (!info) return false
      const linked = deps.dependencies.flatMap(d => {
        if (d.a_id === info.id) return [d.b_id]
        if (d.b_id === info.id) return [d.a_id]
        return []
      })
      if (linked.length === 0) return true
      return linked.some(nid => {
        const neighbor = deps.challenges.find(c => c.id === nid)
        return neighbor && progressStore.isCompleted(neighbor.challenge_key)
      })
    }

    // Линейный режим
    const page = catalogStore.pages.get(key)
    const pageChalls = (page?.challenges ?? [])
      .filter(c => getNodeType(c.name) === 'challenge')
      .sort((a, b) => a.node_index - b.node_index)
    const idx = pageChalls.findIndex(c => c.challenge_key === challenge.challenge_key)
    if (idx <= 0) return true
    return progressStore.isCompleted(pageChalls[idx - 1].challenge_key)
  }

  const filtered = challenges.filter(c => {
    if (getNodeType(c.name) !== 'challenge') return false
    if (statusFilter === 'completed') return progressStore.isCompleted(c.challenge_key)
    if (statusFilter === 'available') return isActuallyAvailable(c)
    return true
  })

  const visible = filtered.slice(0, MAX_VISIBLE)
  const hasMore = filtered.length > MAX_VISIBLE

  const handleToggle = async (challenge: Challenge) => {
    try {
      await progressStore.toggle(challenge.challenge_key, !progressStore.isCompleted(challenge.challenge_key))
    } catch (e) {
      showError((e as Error).message)
    }
  }

  const headerText = loading
    ? t('search.searching')
    : hasMore
      ? t('search.foundMany', { shown: MAX_VISIBLE, total: filtered.length })
      : t('search.found', { n: filtered.length })

  return (
    <>
      <PanelHeader>{t('search.title')}</PanelHeader>

      <Group>
        <Search
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
        />
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SegmentedControl
            size="m"
            value={statusFilter}
            onChange={value => setStatusFilter(value as string)}
            options={STATUS_OPTIONS}
          />
          <SegmentedControl
            size="m"
            value={role}
            onChange={value => setRole(value as string)}
            options={ROLE_OPTIONS}
          />
        </Div>
      </Group>

      <Group>
        <Header>{headerText}</Header>

        {loading || depsLoading ? (
          <Div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spinner />
          </Div>
        ) : (
          <Div style={{ paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {visible.map((challenge, idx) => (
              <React.Fragment key={challenge.challenge_key}>
                {idx > 0 && <div style={{ height: 8 }} />}
                <ChallengeCard
                  challenge={challenge}
                  status={progressStore.isCompleted(challenge.challenge_key) ? 'completed' : 'available'}
                  subtitle={`${challenge.tome_name || challenge.archive_key} · ${t('search.page')} ${challenge.level_number}`}
                  onClick={() => handleToggle(challenge)}
                />
              </React.Fragment>
            ))}
            {visible.length === 0 && (
              <Div>
                <Text style={{ textAlign: 'center', color: 'var(--vkui--color_text_secondary)' }}>
                  {t('search.noResults')}
                </Text>
              </Div>
            )}
          </Div>
        )}
      </Group>

      {snackbar}
    </>
  )
})
