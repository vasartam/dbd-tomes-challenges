import React, { useEffect, useState } from 'react'
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
} from '@vkontakte/vkui'
import {
  Icon28CancelCircleOutline,
  Icon28CheckCircleOutline,
  Icon28SyncOutline,
} from '@vkontakte/icons'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'

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

  useEffect(() => {
    api.adminGetUsers()
      .then(setUsers)
      .catch(err => showError(err.message))
      .finally(() => setLoadingUsers(false))
  }, [])

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
    </>
  )
}
