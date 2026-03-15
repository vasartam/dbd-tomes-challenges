'use client'
import React, { useEffect, useState, useMemo } from 'react'
import {
  PanelHeader,
  PanelHeaderBack,
  Group,
  Header,
  Button,
  Div,
  Spinner,
  Snackbar,
  Text,
  Select,
  FormItem,
  ModalRoot,
  ModalPage,
  ModalPageHeader,
  PanelHeaderButton,
  Checkbox,
  Search,
  Card,
  Caption,
} from '@vkontakte/vkui'
import {
  Icon28CancelCircleOutline,
  Icon28CheckCircleOutline,
  Icon28CancelOutline,
  Icon28DoneOutline,
} from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { useRouter } from 'next/navigation'
import { api } from '../api'
import { langStore } from '../stores'
import DependencyGraph from '../components/DependencyGraph'
import type { Tome, Dependency, ChallengeInfo } from '../types'
import { getNodeType, NODE_TYPE_COLORS } from '../types'

export default observer(function AdminDepsPage() {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const lang = langStore.lang
  const router = useRouter()

  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

  const [tomes, setTomes] = useState<Tome[]>([])
  const [selectedTomeKey, setSelectedTomeKey] = useState<string>('')
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [pages, setPages] = useState<{ id: number; level_number: number }[]>([])
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([])
  const [dependencies, setDependencies] = useState<Dependency[]>([])
  const [loadingEditor, setLoadingEditor] = useState(false)

  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeInfo | null>(null)
  const [editingParents, setEditingParents] = useState<string[]>([])
  const [editingChildren, setEditingChildren] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const showError = (msg: string) => {
    setSnackbar(
      <Snackbar onClose={() => setSnackbar(null)} before={<Icon28CancelCircleOutline fill="var(--vkui--color_icon_negative)" />}>
        {msg}
      </Snackbar>
    )
  }

  const showSuccess = (msg: string) => {
    setSnackbar(
      <Snackbar onClose={() => setSnackbar(null)} before={<Icon28CheckCircleOutline fill="var(--vkui--color_icon_positive)" />}>
        {msg}
      </Snackbar>
    )
  }

  useEffect(() => {
    api.getTomes().then(setTomes).catch(console.error)
  }, [])

  useEffect(() => {
    if (!selectedTomeKey) {
      setPages([])
      setSelectedPageId(null)
      setChallenges([])
      setDependencies([])
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

  const openDependenciesModal = (challenge: ChallengeInfo) => {
    setSelectedChallenge(challenge)
    const parentKeys = dependencies
      .filter(d => d.child_id === challenge.id)
      .map(d => challenges.find(c => c.id === d.parent_id)?.challenge_key)
      .filter(Boolean) as string[]
    const childKeys = dependencies
      .filter(d => d.parent_id === challenge.id)
      .map(d => challenges.find(c => c.id === d.child_id)?.challenge_key)
      .filter(Boolean) as string[]
    setEditingParents(parentKeys)
    setEditingChildren(childKeys)
  }

  const saveDependencies = async () => {
    if (!selectedChallenge) return
    try {
      // Save parents of the selected challenge
      await api.adminSetChallengeDependencies(selectedChallenge.challenge_key, editingParents)

      // Save children: for each child whose relationship changed, update its parents list
      const originalChildKeys = dependencies
        .filter(d => d.parent_id === selectedChallenge.id)
        .map(d => challenges.find(c => c.id === d.child_id)?.challenge_key)
        .filter(Boolean) as string[]

      const added = editingChildren.filter(k => !originalChildKeys.includes(k))
      const removed = originalChildKeys.filter(k => !editingChildren.includes(k))

      for (const childKey of added) {
        const child = challenges.find(c => c.challenge_key === childKey)
        if (!child) continue
        const childParents = dependencies
          .filter(d => d.child_id === child.id)
          .map(d => challenges.find(c => c.id === d.parent_id)?.challenge_key)
          .filter(Boolean) as string[]
        await api.adminSetChallengeDependencies(childKey, [...childParents, selectedChallenge.challenge_key])
      }

      for (const childKey of removed) {
        const child = challenges.find(c => c.challenge_key === childKey)
        if (!child) continue
        const childParents = dependencies
          .filter(d => d.child_id === child.id)
          .map(d => challenges.find(c => c.id === d.parent_id)?.challenge_key)
          .filter(k => k !== selectedChallenge.challenge_key)
          .filter(Boolean) as string[]
        await api.adminSetChallengeDependencies(childKey, childParents)
      }

      // Update local dependency state
      const newParentDeps: Dependency[] = editingParents
        .map(k => challenges.find(c => c.challenge_key === k))
        .filter(Boolean)
        .map(p => ({ child_id: selectedChallenge.id, parent_id: p!.id }))

      const newChildDeps: Dependency[] = editingChildren
        .map(k => challenges.find(c => c.challenge_key === k))
        .filter(Boolean)
        .map(ch => ({ child_id: ch!.id, parent_id: selectedChallenge.id }))

      setDependencies(prev => {
        let next = prev.filter(d => d.child_id !== selectedChallenge.id)
        next = [...next, ...newParentDeps]
        next = next.filter(d => d.parent_id !== selectedChallenge.id)
        next = [...next, ...newChildDeps]
        return next
      })

      setSelectedChallenge(null)
      showSuccess(t('admin.depsSaved'))
    } catch (err) { showError((err as Error).message) }
  }

  const filteredChallenges = useMemo(() => {
    if (!searchQuery.trim()) return challenges
    const q = searchQuery.toLowerCase()
    return challenges.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.objective?.toLowerCase().includes(q) ||
      c.challenge_key.toLowerCase().includes(q)
    )
  }, [challenges, searchQuery])

  const modal = (
    <ModalRoot activeModal={selectedChallenge ? 'edit-deps' : null} onClose={() => setSelectedChallenge(null)}>
      <ModalPage
        id="edit-deps"
        header={
          <ModalPageHeader
            before={<PanelHeaderButton onClick={() => setSelectedChallenge(null)}><Icon28CancelOutline /></PanelHeaderButton>}
            after={<PanelHeaderButton onClick={saveDependencies}><Icon28DoneOutline /></PanelHeaderButton>}
          >
            {t('admin.deps.dependencies')}
          </ModalPageHeader>
        }
      >
        <Div>
          <Text style={{ marginBottom: 16, color: 'var(--vkui--color_text_secondary)' }}>
            {t('admin.deps.challenge')}: <strong>{selectedChallenge?.name || selectedChallenge?.challenge_key}</strong>
          </Text>

          <Text style={{ marginBottom: 8, fontWeight: 600 }}>{t('admin.deps.selectParents')}</Text>
          <div style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
            {challenges.filter(c => c.id !== selectedChallenge?.id).map(c => (
              <Checkbox
                key={c.id}
                checked={editingParents.includes(c.challenge_key)}
                onChange={(e) => {
                  setEditingParents(prev =>
                    e.target.checked ? [...prev, c.challenge_key] : prev.filter(k => k !== c.challenge_key)
                  )
                }}
              >
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: NODE_TYPE_COLORS[getNodeType(c.name)], marginRight: 6 }} />
                {c.name || c.challenge_key}
              </Checkbox>
            ))}
          </div>

          <Text style={{ marginBottom: 8, fontWeight: 600 }}>{t('admin.deps.selectChildren')}</Text>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {challenges.filter(c => c.id !== selectedChallenge?.id).map(c => (
              <Checkbox
                key={c.id}
                checked={editingChildren.includes(c.challenge_key)}
                onChange={(e) => {
                  setEditingChildren(prev =>
                    e.target.checked ? [...prev, c.challenge_key] : prev.filter(k => k !== c.challenge_key)
                  )
                }}
              >
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: NODE_TYPE_COLORS[getNodeType(c.name)], marginRight: 6 }} />
                {c.name || c.challenge_key}
              </Checkbox>
            ))}
          </div>
        </Div>
      </ModalPage>
    </ModalRoot>
  )

  return (
    <>
      <PanelHeader before={<PanelHeaderBack onClick={() => router.push('/admin')} />}>
        {t('admin.deps.title')}
      </PanelHeader>

      <Group>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormItem top={t('admin.deps.tome')}>
            <Select
              value={selectedTomeKey}
              onChange={(e) => setSelectedTomeKey(e.target.value)}
              options={[
                { value: '', label: t('admin.deps.selectTome') },
                ...tomes.map(tome => ({ value: tome.archive_key, label: tome.name || tome.archive_key }))
              ]}
            />
          </FormItem>

          {pages.length > 0 && (
            <FormItem top={t('admin.deps.page')}>
              <Select
                value={selectedPageId?.toString() || ''}
                onChange={(e) => setSelectedPageId(Number(e.target.value))}
                options={pages.map(p => ({ value: p.id.toString(), label: `${t('tome.page')} ${p.level_number}` }))}
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
              <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
                {t('admin.deps.clickToEdit')}
              </Text>
              <DependencyGraph
                challenges={challenges}
                dependencies={dependencies}
                selectedChallenge={selectedChallenge}
                onSelectChallenge={(c) => c && openDependenciesModal(c)}
              />

              <Search
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('admin.deps.search')}
              />

              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {filteredChallenges.map(c => {
                  const parents = dependencies.filter(d => d.child_id === c.id).length
                  const children = dependencies.filter(d => d.parent_id === c.id).length
                  return (
                    <Card key={c.id} mode="outline" style={{ marginBottom: 8, cursor: 'pointer' }} onClick={() => openDependenciesModal(c)}>
                      <div style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 12, height: 12, borderRadius: '50%', background: NODE_TYPE_COLORS[getNodeType(c.name)], flexShrink: 0 }} />
                          <Text weight="2" style={{ flex: 1 }}>{c.name || c.challenge_key}</Text>
                          <Caption style={{ color: 'var(--vkui--color_text_secondary)' }}>↑{parents} ↓{children}</Caption>
                        </div>
                        {c.objective && (
                          <Caption style={{ color: 'var(--vkui--color_text_secondary)', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                            {c.objective.replace(/<[^>]+>/g, '')}
                          </Caption>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </>
          ) : selectedPageId ? (
            <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>{t('admin.deps.noChallenges')}</Text>
          ) : null}
        </Div>
      </Group>

      {snackbar}
      {modal}
    </>
  )
})
