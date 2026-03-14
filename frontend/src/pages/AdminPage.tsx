import React, { useEffect, useState, useMemo } from 'react'
import {
  PanelHeader,
  Group,
  Header,
  SimpleCell,
  Switch,
  Button,
  Div,
  Spinner,
  Snackbar,
  Banner,
  Text,
  Select,
  FormItem,
  ModalRoot,
  ModalPage,
  ModalPageHeader,
  PanelHeaderButton,
  Checkbox,
  Search,
  Title,
  Card,
  Caption,
} from '@vkontakte/vkui'
import {
  Icon28CancelCircleOutline,
  Icon28CheckCircleOutline,
  Icon28SyncOutline,
  Icon28DoneOutline,
  Icon28CancelOutline,
} from '@vkontakte/icons'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import DependencyGraph from '../components/DependencyGraph'
import type { Tome, Challenge, Dependency, PageDependencies, ChallengeInfo } from '../types'
import { getNodeType, NODE_TYPE_COLORS } from '../types'

interface AdminUser {
  id: number
  username: string
  is_admin: boolean
  created_at: string
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)

  // Состояние для редактора зависимостей
  const [tomes, setTomes] = useState<Tome[]>([])
  const [selectedTomeKey, setSelectedTomeKey] = useState<string>('')
  const [selectedPageId, setSelectedPageId] = useState<number | null>(null)
  const [pages, setPages] = useState<{ id: number; level_number: number }[]>([])
  const [challenges, setChallenges] = useState<ChallengeInfo[]>([])
  const [dependencies, setDependencies] = useState<Dependency[]>([])
  const [loadingEditor, setLoadingEditor] = useState(false)

  // Выбранное задание для редактирования
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeInfo | null>(null)
  const [editingParents, setEditingParents] = useState<string[]>([])

  // Поиск
  const [searchQuery, setSearchQuery] = useState('')

  // Загрузка пользователей
  useEffect(() => {
    api.adminGetUsers()
      .then(setUsers)
      .catch(err => showError(err.message))
      .finally(() => setLoadingUsers(false))
  }, [])

  // Загрузка томов
  useEffect(() => {
    api.getTomes().then(setTomes).catch(console.error)
  }, [])

  // Загрузка страниц при выборе тома
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
        if (tome.pages.length > 0) {
          setSelectedPageId(tome.pages[0].id)
        } else {
          setSelectedPageId(null)
          setChallenges([])
          setDependencies([])
        }
      })
      .catch(console.error)
  }, [selectedTomeKey])

  // Загрузка заданий и зависимостей при выборе страницы
  useEffect(() => {
    if (!selectedPageId) {
      setChallenges([])
      setDependencies([])
      return
    }
    setLoadingEditor(true)
    Promise.all([
      api.getPage(selectedPageId),
      api.getPageDependencies(selectedPageId),
    ])
      .then(([pageData, depsData]) => {
        setChallenges(depsData.challenges)
        setDependencies(depsData.dependencies)
      })
      .catch(console.error)
      .finally(() => setLoadingEditor(false))
  }, [selectedPageId])

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

  const showSuccess = (msg: string) => {
    setSnackbar(
      <Snackbar
        onClose={() => setSnackbar(null)}
        before={<Icon28CheckCircleOutline fill="var(--vkui--color_icon_positive)" />}
      >
        {msg}
      </Snackbar>
    )
  }

  const handleToggleAdmin = async (u: AdminUser) => {
    setTogglingId(u.id)
    try {
      const updated = await api.adminToggleAdmin(u.id)
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: updated.is_admin } : x))
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setTogglingId(null)
    }
  }

  const handleSync = async () => {
    setSyncLoading(true)
    setSyncResult(null)
    try {
      const res = await api.adminSyncCatalog()
      setSyncResult(`Синхронизировано: ${res.tomes} томов, ${res.pages} страниц, ${res.challenges} заданий`)
      showSuccess('Каталог успешно синхронизирован')
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setSyncLoading(false)
    }
  }

  // Авто-расстановка
  const handleAutoLayout = async () => {
    if (!selectedPageId) return
    try {
      const res = await api.adminAutoLayoutPage(selectedPageId)
      showSuccess(res.message)
      // Перезагрузить данные
      const [pageData, depsData] = await Promise.all([
        api.getPage(selectedPageId),
        api.getPageDependencies(selectedPageId),
      ])
      setChallenges(depsData.challenges)
      setDependencies(depsData.dependencies)
    } catch (err) {
      showError((err as Error).message)
    }
  }

  // Открыть модалку редактирования зависимостей
  const openDependenciesModal = (challenge: ChallengeInfo) => {
    setSelectedChallenge(challenge)
    const parentIds = dependencies
      .filter(d => d.child_id === challenge.id)
      .map(d => challenges.find(c => c.id === d.parent_id)?.challenge_key)
      .filter(Boolean) as string[]
    setEditingParents(parentIds)
  }

  // Сохранить зависимости
  const saveDependencies = async () => {
    if (!selectedChallenge) return
    try {
      await api.adminSetChallengeDependencies(selectedChallenge.challenge_key, editingParents)
      // Обновить локальное состояние
      const newDeps: Dependency[] = []
      editingParents.forEach(parentKey => {
        const parent = challenges.find(c => c.challenge_key === parentKey)
        if (parent) {
          newDeps.push({ child_id: selectedChallenge.id, parent_id: parent.id })
        }
      })
      setDependencies(prev => [
        ...prev.filter(d => d.child_id !== selectedChallenge.id),
        ...newDeps,
      ])
      setSelectedChallenge(null)
      showSuccess('Зависимости сохранены')
    } catch (err) {
      showError((err as Error).message)
    }
  }

  // Фильтрация заданий по поиску
  const filteredChallenges = useMemo(() => {
    if (!searchQuery.trim()) return challenges
    const q = searchQuery.toLowerCase()
    return challenges.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.objective?.toLowerCase().includes(q) ||
      c.challenge_key.toLowerCase().includes(q)
    )
  }, [challenges, searchQuery])

  // Получить родителей выбранного задания
  const selectedParents = useMemo(() => {
    if (!selectedChallenge) return []
    return dependencies
      .filter(d => d.child_id === selectedChallenge.id)
      .map(d => challenges.find(c => c.id === d.parent_id))
      .filter(Boolean) as ChallengeInfo[]
  }, [selectedChallenge, dependencies, challenges])

  // Получить детей выбранного задания
  const selectedChildren = useMemo(() => {
    if (!selectedChallenge) return []
    return dependencies
      .filter(d => d.parent_id === selectedChallenge.id)
      .map(d => challenges.find(c => c.id === d.child_id))
      .filter(Boolean) as ChallengeInfo[]
  }, [selectedChallenge, dependencies, challenges])

  const modal = (
    <ModalRoot activeModal={selectedChallenge ? 'edit-dependencies' : null} onClose={() => setSelectedChallenge(null)}>
      <ModalPage
        id="edit-dependencies"
        header={
          <ModalPageHeader
            before={<PanelHeaderButton onClick={() => setSelectedChallenge(null)}><Icon28CancelOutline /></PanelHeaderButton>}
            after={<PanelHeaderButton onClick={saveDependencies}><Icon28DoneOutline /></PanelHeaderButton>}
          >
            Зависимости
          </ModalPageHeader>
        }
      >
        <Div>
          <Text style={{ marginBottom: 16, color: 'var(--vkui--color_text_secondary)' }}>
            Задание: <strong>{selectedChallenge?.name || selectedChallenge?.challenge_key}</strong>
          </Text>

          <Text style={{ marginBottom: 8, fontWeight: 600 }}>
            Текущие родители ({selectedParents.length}):
          </Text>
          {selectedParents.length === 0 ? (
            <Text style={{ color: 'var(--vkui--color_text_secondary)', marginBottom: 16 }}>
              Нет родителей (точка входа)
            </Text>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {selectedParents.map(p => (
                <div key={p.id} style={{
                  padding: '4px 8px',
                  background: 'var(--vkui--color_background_secondary)',
                  borderRadius: 4,
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <span>{p.name || p.challenge_key}</span>
                  <Button
                    size="s"
                    mode="tertiary"
                    onClick={() => setEditingParents(prev => prev.filter(k => k !== p.challenge_key))}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}

          <Text style={{ marginBottom: 8, fontWeight: 600 }}>
            Текущие дети ({selectedChildren.length}):
          </Text>
          {selectedChildren.length === 0 ? (
            <Text style={{ color: 'var(--vkui--color_text_secondary)', marginBottom: 16 }}>
              Нет детей
            </Text>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {selectedChildren.map(c => (
                <div key={c.id} style={{
                  padding: '4px 8px',
                  background: 'var(--vkui--color_background_secondary)',
                  borderRadius: 4,
                  marginBottom: 4,
                }}>
                  {c.name || c.challenge_key}
                </div>
              ))}
            </div>
          )}

          <Text style={{ marginBottom: 8, fontWeight: 600 }}>
            Выберите родителей:
          </Text>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {challenges
              .filter(c => c.id !== selectedChallenge?.id)
              .map(c => {
                const nodeType = getNodeType(c.name)
                return (
                  <Checkbox
                    key={c.id}
                    checked={editingParents.includes(c.challenge_key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEditingParents(prev => [...prev, c.challenge_key])
                      } else {
                        setEditingParents(prev => prev.filter(k => k !== c.challenge_key))
                      }
                    }}
                  >
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: NODE_TYPE_COLORS[nodeType],
                      marginRight: 6,
                    }} />
                    {c.name || c.challenge_key}
                  </Checkbox>
                )
              })}
          </div>
        </Div>
      </ModalPage>
    </ModalRoot>
  )

  return (
    <>
      <PanelHeader>Админ-панель</PanelHeader>

      <Group header={<Header>Синхронизация каталога</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            Загружает актуальные данные с dbd.tricky.lol и сохраняет в базу.
          </Text>
          {syncResult && (
            <Banner
              title="Результат"
              subtitle={syncResult}
            />
          )}
          <Button
            size="l"
            stretched
            loading={syncLoading}
            before={<Icon28SyncOutline />}
            onClick={handleSync}
          >
            Запустить синхронизацию
          </Button>
        </Div>
      </Group>

      <Group header={<Header>Редактор зависимостей</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <FormItem top="Том">
            <Select
              value={selectedTomeKey}
              onChange={(e) => setSelectedTomeKey(e.target.value)}
              options={[
                { value: '', label: 'Выберите том' },
                ...tomes.map(t => ({ value: t.archive_key, label: t.name || t.archive_key }))
              ]}
            />
          </FormItem>

          {pages.length > 0 && (
            <FormItem top="Страница">
              <Select
                value={selectedPageId?.toString() || ''}
                onChange={(e) => setSelectedPageId(Number(e.target.value))}
                options={pages.map(p => ({ value: p.id.toString(), label: `Страница ${p.level_number}` }))}
              />
            </FormItem>
          )}

          {selectedPageId && (
            <Button
              size="l"
              stretched
              onClick={handleAutoLayout}
            >
              Авто-расстановка (линейная)
            </Button>
          )}

          {loadingEditor ? (
            <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spinner />
            </Div>
          ) : challenges.length > 0 ? (
            <>
              {/* Граф зависимостей */}
              <div style={{ marginTop: 16 }}>
                <Text style={{ color: 'var(--vkui--color_text_secondary)', marginBottom: 8 }}>
                  Кликните на узел для редактирования зависимостей:
                </Text>
                <DependencyGraph
                  challenges={challenges}
                  dependencies={dependencies}
                  selectedChallenge={selectedChallenge}
                  onSelectChallenge={(c) => c && openDependenciesModal(c)}
                  width={600}
                  height={400}
                />
              </div>

              {/* Поиск и список заданий */}
              <Search
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию или описанию"
              />

              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {filteredChallenges.map(c => {
                  const nodeType = getNodeType(c.name)
                  const parents = dependencies.filter(d => d.child_id === c.id).map(d => d.parent_id)
                  const children = dependencies.filter(d => d.parent_id === c.id).map(d => d.child_id)

                  return (
                    <Card
                      key={c.id}
                      mode="outline"
                      style={{ marginBottom: 8, cursor: 'pointer' }}
                      onClick={() => openDependenciesModal(c)}
                    >
                      <div style={{ padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            background: NODE_TYPE_COLORS[nodeType],
                            flexShrink: 0,
                          }} />
                          <Text weight="2" style={{ flex: 1 }}>
                            {c.name || c.challenge_key}
                          </Text>
                          <Caption style={{ color: 'var(--vkui--color_text_secondary)' }}>
                            ↑{parents.length} ↓{children.length}
                          </Caption>
                        </div>
                        {c.objective && (
                          <Caption
                            style={{
                              color: 'var(--vkui--color_text_secondary)',
                              marginTop: 4,
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            } as React.CSSProperties}
                          >
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
            <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
              Нет заданий на этой странице
            </Text>
          ) : null}
        </Div>
      </Group>

      <Group header={<Header>Пользователи</Header>}>
        {loadingUsers ? (
          <Div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spinner />
          </Div>
        ) : (
          users.map(u => (
            <SimpleCell
              key={u.id}
              subtitle={u.is_admin ? 'Администратор' : 'Пользователь'}
              after={
                <Switch
                  checked={u.is_admin}
                  disabled={u.id === user?.id || togglingId === u.id}
                  onChange={() => handleToggleAdmin(u)}
                />
              }
            >
              {u.username}
            </SimpleCell>
          ))
        )}
      </Group>

      {snackbar}
      {modal}
    </>
  )
}
