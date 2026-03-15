'use client'
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
  Icon28ChevronRightOutline,
} from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { useRouter } from 'next/navigation'
import { api } from '../api'
import { authStore, langStore } from '../stores'

interface AdminUser {
  id: number
  username: string
  is_admin: boolean
  created_at: string
}

export default observer(function AdminPage() {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const router = useRouter()

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
      setSyncResult(t('admin.syncResultText', { tomes: res.tomes, pages: res.pages, challenges: res.challenges }))
      showSuccess(t('admin.syncSuccess'))
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setSyncLoading(false)
    }
  }

  return (
    <>
      <PanelHeader>{t('admin.title')}</PanelHeader>

      <Group header={<Header>{t('admin.sync')}</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            {t('admin.syncDesc')}
          </Text>
          {syncResult && (
            <Banner title={t('admin.syncResult')} subtitle={syncResult} />
          )}
          <Button size="l" stretched loading={syncLoading} before={<Icon28SyncOutline />} onClick={handleSync}>
            {t('admin.syncBtn')}
          </Button>
        </Div>
      </Group>

      <Group header={<Header>{t('admin.deps.title')}</Header>}>
        <SimpleCell
          after={<Icon28ChevronRightOutline />}
          onClick={() => router.push('/admin/deps')}
          style={{ cursor: 'pointer' }}
        >
          {t('admin.deps.openEditor')}
        </SimpleCell>
      </Group>

      <Group header={<Header>{t('admin.users')}</Header>}>
        {loadingUsers ? (
          <Div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Spinner />
          </Div>
        ) : (
          users.map(u => (
            <SimpleCell
              key={u.id}
              subtitle={u.is_admin ? t('admin.userAdmin') : t('admin.userRegular')}
              after={
                <Switch
                  checked={u.is_admin}
                  disabled={u.id === authStore.user?.id || togglingId === u.id}
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
})
