import React, { useState, useEffect, useCallback } from 'react'
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
import { api } from '../api'
import { useProgress } from '../contexts/ProgressContext'
import { useLanguage } from '../contexts/LanguageContext'
import ChallengeCard from '../components/ChallengeCard'
import type { Challenge } from '../types'

export default function SearchPage() {
  const { isCompleted, toggleProgress } = useProgress()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(false)
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

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

  const doSearch = useCallback(() => {
    setLoading(true)
    api.getChallenges({
      q: query || undefined,
      role: role || undefined,
    })
      .then(setChallenges)
      .catch(err => showError((err as Error).message))
      .finally(() => setLoading(false))
  }, [query, role])

  useEffect(() => {
    const timer = setTimeout(doSearch, 300)
    return () => clearTimeout(timer)
  }, [doSearch])

  const filtered = challenges.filter(c => {
    if (statusFilter === 'completed') return isCompleted(c.challenge_key)
    if (statusFilter === 'available') return !isCompleted(c.challenge_key)
    return true
  })

  const handleToggle = async (challenge: Challenge) => {
    try {
      await toggleProgress(challenge.challenge_key, !isCompleted(challenge.challenge_key))
    } catch (e) {
      showError((e as Error).message)
    }
  }

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
        <Header>
          {loading ? t('search.searching') : t('search.found', { n: filtered.length })}
        </Header>

        {loading ? (
          <Div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spinner />
          </Div>
        ) : (
          <Div style={{ paddingBottom: 72, display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filtered.map((challenge, idx) => (
              <React.Fragment key={challenge.challenge_key}>
                {idx > 0 && <div style={{ height: 8 }} />}
                <ChallengeCard
                  challenge={challenge}
                  status={isCompleted(challenge.challenge_key) ? 'completed' : 'available'}
                  subtitle={`${challenge.tome_name || challenge.archive_key} · ${t('search.page')} ${challenge.level_number}`}
                  onClick={() => handleToggle(challenge)}
                />
              </React.Fragment>
            ))}
            {filtered.length === 0 && !loading && (
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
}
