'use client'
import React, { useEffect, useState } from 'react'
import {
  PanelHeader,
  PanelHeaderBack,
  Group,
  Button,
  Div,
  Spinner,
  Snackbar,
  Text,
  CustomSelect,
  FormItem,
} from '@vkontakte/vkui'
import {
  Icon28CancelCircleOutline,
  Icon28CheckCircleOutline,
} from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { useRouter } from 'next/navigation'
import { api } from '../api'
import { langStore } from '../stores'
import DependencyGraph from '../components/DependencyGraph'
import type { Tome, Dependency, ChallengeInfo } from '../types'

interface Props {
  initialArchiveKey?: string
}

export default observer(function AdminDepsPage({ initialArchiveKey }: Props) {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const lang = langStore.lang
  const router = useRouter()

  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

  const [tomes, setTomes]                     = useState<Tome[]>([])
  const [selectedTomeKey, setSelectedTomeKey] = useState<string>(initialArchiveKey ?? '')
  const [selectedPageId, setSelectedPageId]   = useState<number | null>(null)
  const [pages, setPages]                     = useState<{ id: number; level_number: number }[]>([])
  const [challenges, setChallenges]           = useState<ChallengeInfo[]>([])
  const [dependencies, setDependencies]       = useState<Dependency[]>([])
  const [loadingEditor, setLoadingEditor]     = useState(false)

  const showError = (msg: string) => setSnackbar(
    <Snackbar onClose={() => setSnackbar(null)} before={<Icon28CancelCircleOutline fill="var(--vkui--color_icon_negative)" />}>
      {msg}
    </Snackbar>
  )

  const showSuccess = (msg: string) => setSnackbar(
    <Snackbar onClose={() => setSnackbar(null)} before={<Icon28CheckCircleOutline fill="var(--vkui--color_icon_positive)" />}>
      {msg}
    </Snackbar>
  )

  // Загрузка томов
  useEffect(() => {
    api.getTomes().then(setTomes).catch(console.error)
  }, [])

  // Обновляем URL при смене тома
  useEffect(() => {
    const target = selectedTomeKey ? `/admin/deps/${selectedTomeKey}` : '/admin/deps'
    window.history.replaceState(null, '', target)
  }, [selectedTomeKey])

  // Загрузка страниц при смене тома
  useEffect(() => {
    if (!selectedTomeKey) {
      setPages([]); setSelectedPageId(null); setChallenges([]); setDependencies([])
      return
    }
    api.getTome(selectedTomeKey)
      .then(tome => {
        setPages(tome.pages)
        setSelectedPageId(tome.pages.length > 0 ? tome.pages[0].id : null)
        if (tome.pages.length === 0) { setChallenges([]); setDependencies([]) }
      })
      .catch(console.error)
  }, [selectedTomeKey])

  // Загрузка заданий и зависимостей при смене страницы
  useEffect(() => {
    if (!selectedPageId) { setChallenges([]); setDependencies([]); return }
    setLoadingEditor(true)
    Promise.all([
      api.getPage(selectedPageId),
      api.getPageDependencies(selectedPageId, lang),
    ])
      .then(([, depsData]) => {
        setChallenges(depsData.challenges)
        setDependencies(depsData.dependencies)
      })
      .catch(console.error)
      .finally(() => setLoadingEditor(false))
  }, [selectedPageId, lang])

  // ── Обработчики графа ────────────────────────────────────────────────────────

  const handleToggleLink = async (a: ChallengeInfo, b: ChallengeInfo) => {
    const exists = dependencies.some(d =>
      (d.a_id === a.id && d.b_id === b.id) || (d.a_id === b.id && d.b_id === a.id)
    )

    const currentLinked = dependencies
      .flatMap(d => {
        if (d.a_id === a.id) return [challenges.find(c => c.id === d.b_id)?.challenge_key]
        if (d.b_id === a.id) return [challenges.find(c => c.id === d.a_id)?.challenge_key]
        return []
      })
      .filter(Boolean) as string[]

    const newLinked = exists
      ? currentLinked.filter(k => k !== b.challenge_key)
      : [...currentLinked, b.challenge_key]

    try {
      await api.adminSetChallengeDependencies(a.challenge_key, newLinked)

      const newDeps: Dependency[] = newLinked
        .map(k => challenges.find(c => c.challenge_key === k))
        .filter(Boolean)
        .map(linked => ({
          a_id: Math.min(a.id, linked!.id),
          b_id: Math.max(a.id, linked!.id),
        }))

      setDependencies(prev => [
        ...prev.filter(d => d.a_id !== a.id && d.b_id !== a.id),
        ...newDeps,
      ])

      showSuccess(t('admin.depsSaved'))
    } catch (err) { showError((err as Error).message) }
  }

  const handleMoveChallenge = async (id: number, posX: number, posY: number) => {
    const challenge = challenges.find(c => c.id === id)
    if (!challenge) return
    try {
      await api.adminSetChallengePosition(challenge.challenge_key, posX, posY)
      setChallenges(prev =>
        prev.map(c => c.id === id ? { ...c, pos_x: posX, pos_y: posY } : c)
      )
    } catch (err) { showError((err as Error).message) }
  }

  const handleAutoLayout = async () => {
    if (!selectedPageId) return
    try {
      const res = await api.adminAutoLayoutPage(selectedPageId)
      showSuccess(res.message)
      const [, depsData] = await Promise.all([
        api.getPage(selectedPageId),
        api.getPageDependencies(selectedPageId, lang),
      ])
      setChallenges(depsData.challenges)
      setDependencies(depsData.dependencies)
    } catch (err) { showError((err as Error).message) }
  }

  const tomeOptions = [
    { value: '', label: t('admin.deps.selectTome') },
    ...tomes.map(tome => ({ value: tome.archive_key, label: tome.name || tome.archive_key })),
  ]

  const pageOptions = pages.map(p => ({
    value: p.id.toString(),
    label: `${t('tome.page')} ${p.level_number}`,
  }))

  return (
    <>
      <PanelHeader before={<PanelHeaderBack onClick={() => router.push('/admin')} />}>
        {t('admin.deps.title')}
      </PanelHeader>

      <Group>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormItem top={t('admin.deps.tome')}>
            {/* CustomSelect позволяет задать высоту выпадающего списка */}
            <CustomSelect
              value={selectedTomeKey}
              onChange={(e) => setSelectedTomeKey(e.target.value)}
              options={tomeOptions}
              searchable
              dropdownOffsetDistance={4}
            />
          </FormItem>

          {pages.length > 0 && (
            <FormItem top={t('admin.deps.page')}>
              <CustomSelect
                value={selectedPageId?.toString() || ''}
                onChange={(e) => setSelectedPageId(Number(e.target.value))}
                options={pageOptions}
              />
            </FormItem>
          )}

          {selectedPageId && (
            <Button size="l" stretched onClick={handleAutoLayout}>
              {t('admin.deps.autoLayout')}
            </Button>
          )}

          {loadingEditor ? (
            <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></Div>
          ) : challenges.length > 0 ? (
            <>
              <Text style={{ color: 'var(--vkui--color_text_secondary)', fontSize: 13 }}>
                {t('admin.deps.clickToEdit')}
              </Text>

              <DependencyGraph
                challenges={challenges}
                dependencies={dependencies}
                mode="admin"
                onToggleLink={handleToggleLink}
                onMoveChallenge={handleMoveChallenge}
              />
            </>
          ) : selectedPageId ? (
            <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>{t('admin.deps.noChallenges')}</Text>
          ) : null}
        </Div>
      </Group>

      {snackbar}
    </>
  )
})
