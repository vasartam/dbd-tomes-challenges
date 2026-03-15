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
import ChallengeTree from '../components/ChallengeTree'
import ChallengeGrid, { hasGridPositions } from '../components/ChallengeGrid'
import ChallengeCard from '../components/ChallengeCard'
import type {
  TomeWithPages,
  PageWithChallenges,
  Challenge,
  ChallengeStatus,
  PageDependencies,
  PageCompletionStatus,
} from '../types'
import { getNodeType } from '../types'

interface Props {
  archiveKey: string
  onBack: () => void
}

export default observer(function TomePage({ archiveKey, onBack }: Props) {
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

  const { prologues, epilogues, challenges: realChallenges } = useMemo(() => {
    if (!currentPage?.challenges) return { prologues: [], epilogues: [], challenges: [] }

    const prologues: Challenge[] = []
    const epilogues: Challenge[] = []
    const challenges: Challenge[] = []

    for (const c of currentPage.challenges) {
      const type = getNodeType(c.name)
      if (type === 'prologue') prologues.push(c)
      else if (type === 'epilogue') epilogues.push(c)
      else if (type === 'challenge') challenges.push(c)
    }

    return { prologues, epilogues, challenges }
  }, [currentPage?.challenges])

  const useGrid = useMemo(() => {
    return currentPage?.challenges ? hasGridPositions(currentPage.challenges) : false
  }, [currentPage?.challenges])

  const getParents = (challengeId: number): number[] => {
    if (!currentDeps) return []
    return currentDeps.dependencies
      .filter(d => d.child_id === challengeId)
      .map(d => d.parent_id)
  }

  const getChildren = (challengeId: number): number[] => {
    if (!currentDeps) return []
    return currentDeps.dependencies
      .filter(d => d.parent_id === challengeId)
      .map(d => d.child_id)
  }

  const getStatus = (challenge: Challenge): ChallengeStatus => {
    if (progressStore.isCompleted(challenge.challenge_key)) return 'completed'

    if (getNodeType(challenge.name) === 'prologue') return 'available'

    if (useGrid && currentDeps) {
      const parents = getParents(challenge.id)
      if (parents.length === 0) return 'available'
      const hasCompletedParent = parents.some(parentId => {
        const parentChallenge = currentPage?.challenges.find(c => c.id === parentId)
        return parentChallenge && progressStore.isCompleted(parentChallenge.challenge_key)
      })
      return hasCompletedParent ? 'available' : 'locked'
    }

    const challs = realChallenges
    const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
    if (idx === 0 || progressStore.isCompleted(challs[idx - 1]?.challenge_key)) return 'available'
    return 'locked'
  }

  const handleChallengeClick = async (challenge: Challenge) => {
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
      if (useGrid && currentDeps) {
        const parents = getParents(challenge.id)
        if (parents.length > 0) {
          const hasCompletedParent = parents.some(parentId => {
            const parentChallenge = currentPage?.challenges.find(c => c.id === parentId)
            return parentChallenge && progressStore.isCompleted(parentChallenge.challenge_key)
          })
          if (!hasCompletedParent) {
            const parentNames = parents
              .map(pid => currentPage?.challenges.find(c => c.id === pid))
              .filter(Boolean)
              .map(c => c!.name || c!.challenge_key)
              .join(', ')
            showError(t('challenge.completeOneOf', { names: parentNames }))
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
      if (useGrid && currentDeps) {
        const children = getChildren(challenge.id)
        const completedChildren = children.filter(childId => {
          const childChallenge = currentPage?.challenges.find(c => c.id === childId)
          return childChallenge && progressStore.isCompleted(childChallenge.challenge_key)
        })
        if (completedChildren.length > 0) {
          const names = completedChildren
            .map(cid => currentPage?.challenges.find(c => c.id === cid))
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

  const renderSpecialNodes = () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {[...prologues, ...epilogues].map(c => (
        <div key={c.challenge_key} style={{ width: 140 }}>
          <ChallengeCard
            challenge={c}
            status={getStatus(c)}
            onClick={() => handleChallengeClick(c)}
            compact
          />
        </div>
      ))}
    </div>
  )

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

            <Div style={{ paddingBottom: 72, overflowX: 'auto' }}>
              {(prologues.length > 0 || epilogues.length > 0) && renderSpecialNodes()}

              {realChallenges.length === 0 ? (
                <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
                  {t('tome.noChallenges')}
                </Text>
              ) : useGrid ? (
                <ChallengeGrid
                  challenges={realChallenges}
                  dependencies={currentDeps?.dependencies ?? []}
                  getStatus={getStatus}
                  onChallengeClick={handleChallengeClick}
                />
              ) : (
                <ChallengeTree
                  challenges={realChallenges}
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
