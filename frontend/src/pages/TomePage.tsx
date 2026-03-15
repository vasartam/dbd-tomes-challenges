'use client'
import React, { useEffect, useState, useMemo } from 'react'
import {
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Div,
  Spinner,
  Snackbar,
  Tabs,
  TabsItem,
  Text,
  Badge,
} from '@vkontakte/vkui'
import { Icon28CancelCircleOutline, Icon28CheckCircleOutline } from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { catalogStore, progressStore, langStore } from '../stores'
import DependencyGraph from '../components/DependencyGraph'
import type {
  TomeWithPages,
  PageWithChallenges,
  Challenge,
  ChallengeInfo,
  ChallengeStatus,
  PageDependencies,
  PageCompletionStatus,
} from '../types'
import { getNodeType } from '../types'

interface Props {
  archiveKey: string
  // level_number страницы из URL (для восстановления при обновлении)
  initialPageLevel?: number
  onBack: () => void
}

export default observer(function TomePage({ archiveKey, initialPageLevel, onBack }: Props) {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const lang = langStore.lang

  const [tome, setTome] = useState<TomeWithPages | null>(null)
  const [pages, setPages] = useState<PageWithChallenges[]>([])
  const [dependencies, setDependencies] = useState<Map<number, PageDependencies>>(new Map())
  const [pageCompletion, setPageCompletion] = useState<Map<number, PageCompletionStatus>>(new Map())
  const [activePage, setActivePage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

  useEffect(() => {
    progressStore.load()
  }, [])

  // Синхронизируем URL при смене активной страницы
  useEffect(() => {
    if (!archiveKey || pages.length === 0) return
    const level = pages[activePage]?.level_number
    if (level == null) return
    const target = pages.length > 1
      ? `/tomes/${archiveKey}/${level}`
      : `/tomes/${archiveKey}`
    window.history.replaceState(null, '', target)
  }, [activePage, archiveKey, pages])

  useEffect(() => {
    if (!archiveKey) return
    setLoading(true)
    setActivePage(0)
    setDependencies(new Map())
    setPageCompletion(new Map())

    catalogStore.loadTome(archiveKey)
      .then(async (tomeData) => {
        setTome(tomeData)
        const pagesWithChallenges = await Promise.all(
          tomeData.pages.map(page => catalogStore.loadPage(page.id))
        )
        setPages(pagesWithChallenges)

        // Восстанавливаем активную страницу из URL
        if (initialPageLevel != null) {
          const idx = pagesWithChallenges.findIndex(p => p.level_number === initialPageLevel)
          if (idx >= 0) setActivePage(idx)
        }

        const depsMap = new Map<number, PageDependencies>()
        const completionMap = new Map<number, PageCompletionStatus>()

        await Promise.all(
          pagesWithChallenges.map(async (page) => {
            try {
              const [deps, completion] = await Promise.all([
                catalogStore.loadPageDeps(page.id),
                catalogStore.loadPageCompletion(page.id),
              ])
              depsMap.set(page.id, deps)
              completionMap.set(page.id, completion)
            } catch {
              depsMap.set(page.id, { challenges: [], dependencies: [] })
            }
          })
        )
        setDependencies(depsMap)
        setPageCompletion(completionMap)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [archiveKey, lang])

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

  const currentPage = pages[activePage]
  const currentDeps = currentPage ? dependencies.get(currentPage.id) : null
  const currentCompletion = currentPage ? pageCompletion.get(currentPage.id) : null

  // Для обратной совместимости (линейный режим без позиций): обычные задания без пролога/эпилога
  const realChallenges = useMemo(() => {
    if (!currentPage?.challenges) return []
    return currentPage.challenges.filter(c => getNodeType(c.name) === 'challenge')
  }, [currentPage?.challenges])

  // Используем ChallengeInfo из deps (содержат позиции) для графа
  const graphChallenges = currentDeps?.challenges ?? []
  const useGraph = graphChallenges.length > 0

  const getLinked = (challengeId: number): number[] => {
    if (!currentDeps) return []
    return currentDeps.dependencies.flatMap(d => {
      if (d.a_id === challengeId) return [d.b_id]
      if (d.b_id === challengeId) return [d.a_id]
      return []
    })
  }

  // Ищем задание в deps (ChallengeInfo) — они содержат pos_x/pos_y
  const findChallenge = (id: number): ChallengeInfo | undefined =>
    graphChallenges.find(c => c.id === id)

  const getStatus = (challenge: ChallengeInfo): ChallengeStatus => {
    if (progressStore.isCompleted(challenge.challenge_key)) return 'completed'

    if (getNodeType(challenge.name) === 'prologue') {
      // На первой странице пролог всегда доступен
      if (activePage === 0) return 'available'
      // На остальных — доступен, если выполнен хотя бы один эпилог предыдущей страницы
      const prevPage = pages[activePage - 1]
      const prevEpilogues = prevPage?.challenges.filter(c => getNodeType(c.name) === 'epilogue') ?? []
      const prevCompleted = prevEpilogues.some(c => progressStore.isCompleted(c.challenge_key))
      return prevCompleted ? 'available' : 'locked'
    }

    if (useGraph && currentDeps) {
      const linked = getLinked(challenge.id)
      if (linked.length === 0) return 'available'
      const hasCompletedNeighbor = linked.some(neighborId => {
        const neighbor = findChallenge(neighborId)
        return neighbor && progressStore.isCompleted(neighbor.challenge_key)
      })
      return hasCompletedNeighbor ? 'available' : 'locked'
    }

    const challs = realChallenges
    const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
    if (idx === 0 || progressStore.isCompleted(challs[idx - 1]?.challenge_key)) return 'available'
    return 'locked'
  }

  const handleChallengeClick = async (challenge: ChallengeInfo) => {
    const done = progressStore.isCompleted(challenge.challenge_key)
    const nodeType = getNodeType(challenge.name)

    if (nodeType === 'prologue' || nodeType === 'epilogue') {
      try {
        await progressStore.toggle(challenge.challenge_key, !done)
        if (currentPage) {
          const completion = await catalogStore.refreshPageCompletion(currentPage.id)
          setPageCompletion(prev => new Map(prev).set(currentPage.id, completion))
        }
      } catch (e) {
        showError((e as Error).message)
      }
      return
    }

    if (!done) {
      if (useGraph && currentDeps) {
        const linked = getLinked(challenge.id)
        if (linked.length > 0) {
          const hasCompletedNeighbor = linked.some(neighborId => {
            const neighbor = findChallenge(neighborId)
            return neighbor && progressStore.isCompleted(neighbor.challenge_key)
          })
          if (!hasCompletedNeighbor) {
            const neighborNames = linked
              .map(nid => findChallenge(nid))
              .filter(Boolean)
              .map(c => c!.name || c!.challenge_key)
              .join(', ')
            showError(t('challenge.completeOneOf', { names: neighborNames }))
            return
          }
        }
      } else {
        const challs = realChallenges
        const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
        const prevChallenge = challs[idx - 1]
        const available = idx === 0 || progressStore.isCompleted(prevChallenge?.challenge_key)
        if (!available) {
          showError(t('challenge.completeFirst', { name: prevChallenge?.name || prevChallenge?.challenge_key || '' }))
          return
        }
      }

      try {
        await progressStore.toggle(challenge.challenge_key, true)
        if (currentPage) {
          const completion = await catalogStore.refreshPageCompletion(currentPage.id)
          setPageCompletion(prev => new Map(prev).set(currentPage.id, completion))
        }
      } catch (e) {
        showError((e as Error).message)
      }
    } else {
      if (useGraph && currentDeps) {
        const linked = getLinked(challenge.id)
        const wouldBlock = linked.filter(neighborId => {
          const neighbor = findChallenge(neighborId)
          if (!neighbor || !progressStore.isCompleted(neighbor.challenge_key)) return false
          const neighborLinked = getLinked(neighborId)
          const otherCompleted = neighborLinked.filter(otherId => {
            if (otherId === challenge.id) return false
            const other = findChallenge(otherId)
            return other && progressStore.isCompleted(other.challenge_key)
          })
          return otherCompleted.length === 0
        })
        if (wouldBlock.length > 0) {
          const names = wouldBlock
            .map(nid => findChallenge(nid))
            .filter(Boolean)
            .map(c => `«${c!.name || c!.challenge_key}»`)
            .join(', ')
          showError(t('challenge.unmarkFirst', { names }))
          return
        }
      } else {
        const challs = realChallenges
        const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
        const dependents = challs.slice(idx + 1).filter(c => progressStore.isCompleted(c.challenge_key))
        if (dependents.length > 0) {
          const names = dependents.map(c => `«${c.name || c.challenge_key}»`).join(', ')
          showError(t('challenge.unmarkFirst', { names }))
          return
        }
      }

      try {
        await progressStore.toggle(challenge.challenge_key, false)
        if (currentPage) {
          const completion = await catalogStore.refreshPageCompletion(currentPage.id)
          setPageCompletion(prev => new Map(prev).set(currentPage.id, completion))
        }
      } catch (e) {
        showError((e as Error).message)
      }
    }
  }

  return (
    <>
      <PanelHeader before={<PanelHeaderBack onClick={onBack} />}>
        {tome?.name || archiveKey}
      </PanelHeader>

      {loading ? (
        <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </Div>
      ) : (
        <>
          {pages.length > 1 && (
            <Tabs>
              {pages.map((page, i) => {
                const completion = pageCompletion.get(page.id)
                return (
                  <TabsItem
                    key={page.id}
                    selected={activePage === i}
                    onClick={() => setActivePage(i)}
                    after={completion?.is_complete ? (
                      <Icon28CheckCircleOutline fill="var(--vkui--color_icon_positive)" />
                    ) : undefined}
                  >
                    {t('tome.page')} {page.level_number}
                  </TabsItem>
                )
              })}
            </Tabs>
          )}

          <Group>
            <Header>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {t('tome.pageHeader', { n: currentPage?.level_number ?? '', count: realChallenges.length })}
                {currentCompletion?.is_complete && (
                  <Badge mode="prominent" style={{ background: '#4CAF50' }}>
                    {t('tome.completed')}
                  </Badge>
                )}
              </div>
            </Header>

            <Div style={{ paddingBottom: 72 }}>
              {graphChallenges.length === 0 ? (
                <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
                  {t('tome.noChallenges')}
                </Text>
              ) : (
                <DependencyGraph
                  challenges={graphChallenges}
                  dependencies={currentDeps?.dependencies ?? []}
                  mode="view"
                  getStatus={getStatus}
                  onChallengeClick={handleChallengeClick}
                />
              )}
            </Div>
          </Group>
        </>
      )}

      {snackbar}
    </>
  )
})
