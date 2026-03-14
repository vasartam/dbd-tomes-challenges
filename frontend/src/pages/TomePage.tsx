import React, { useEffect, useState } from 'react'
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
} from '@vkontakte/vkui'
import { Icon28CancelCircleOutline } from '@vkontakte/icons'
import { api } from '../api'
import { useProgress } from '../contexts/ProgressContext'
import ChallengeTree from '../components/ChallengeTree'
import type { TomeWithPages, PageWithChallenges, Challenge, ChallengeStatus } from '../types'

interface Props {
  archiveKey: string | null
  onBack: () => void
}

export default function TomePage({ archiveKey, onBack }: Props) {
  const { isCompleted, toggleProgress } = useProgress()
  const [tome, setTome] = useState<TomeWithPages | null>(null)
  const [pages, setPages] = useState<PageWithChallenges[]>([])
  const [activePage, setActivePage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

  useEffect(() => {
    if (!archiveKey) return
    setLoading(true)
    setActivePage(0)
    api.getTome(archiveKey)
      .then(async (tomeData) => {
        setTome(tomeData)
        const pagesWithChallenges = await Promise.all(
          tomeData.pages.map(page => api.getPage(page.id))
        )
        setPages(pagesWithChallenges)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [archiveKey])

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

  const getStatus = (challenge: Challenge): ChallengeStatus => {
    const challs = pages[activePage]?.challenges ?? []
    const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
    if (isCompleted(challenge.challenge_key)) return 'completed'
    if (idx === 0 || isCompleted(challs[idx - 1]?.challenge_key)) return 'available'
    return 'locked'
  }

  const handleChallengeClick = async (challenge: Challenge) => {
    const challs = pages[activePage]?.challenges ?? []
    const idx = challs.findIndex(c => c.challenge_key === challenge.challenge_key)
    const done = isCompleted(challenge.challenge_key)

    if (!done) {
      const available = idx === 0 || isCompleted(challs[idx - 1]?.challenge_key)
      if (!available) {
        const prev = challs[idx - 1]
        showError(`Сначала выполните задание «${prev.name || prev.challenge_key}»`)
        return
      }
      try {
        await toggleProgress(challenge.challenge_key, true)
      } catch (e) {
        showError((e as Error).message)
      }
    } else {
      const dependents = challs.slice(idx + 1).filter(c => isCompleted(c.challenge_key))
      if (dependents.length > 0) {
        const names = dependents.map(c => `«${c.name || c.challenge_key}»`).join(', ')
        showError(`Сначала снимите отметку с заданий: ${names}`)
        return
      }
      try {
        await toggleProgress(challenge.challenge_key, false)
      } catch (e) {
        showError((e as Error).message)
      }
    }
  }

  const currentPage = pages[activePage]

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
              {pages.map((page, i) => (
                <TabsItem
                  key={page.id}
                  selected={activePage === i}
                  onClick={() => setActivePage(i)}
                >
                  Страница {page.level_number}
                </TabsItem>
              ))}
            </Tabs>
          )}

          <Group>
            <Header>
              Страница {currentPage?.level_number} — {currentPage?.challenges?.length ?? 0} заданий
            </Header>

            <Div style={{ paddingBottom: 72 }}>
              {currentPage?.challenges?.length === 0 && (
                <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
                  На этой странице нет заданий
                </Text>
              )}

              <ChallengeTree
                challenges={currentPage?.challenges ?? []}
                getStatus={getStatus}
                onChallengeClick={handleChallengeClick}
              />
            </Div>
          </Group>
        </>
      )}

      {snackbar}
    </>
  )
}
