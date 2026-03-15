'use client'
import React, { useEffect, useRef, useState } from 'react'
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
  Text,
  Caption,
  Progress,
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

interface ScrapeStatus {
  running: boolean
  total: number
  current: number
  last_run: string | null
  last_matched: number
  last_downloaded: number
}

interface SyncRecord {
  last_run: string
  tomes: number
  pages: number
  challenges: number
}

const SYNC_STORAGE_KEY = 'admin_sync_last'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString()
}

export default observer(function AdminPage() {
  const t = (key: string, vars?: Record<string, string | number>) => langStore.t(key, vars)
  const router = useRouter()

  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null)
  const [togglingId, setTogglingId] = useState<number | null>(null)
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus>({
    running: false, total: 0, current: 0,
    last_run: null, last_matched: 0, last_downloaded: 0,
  })
  const [snackbar, setSnackbar] = useState<React.ReactNode>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Загрузка пользователей
  useEffect(() => {
    api.adminGetUsers()
      .then(setUsers)
      .catch(err => showError(err.message))
      .finally(() => setLoadingUsers(false))
  }, [])

  // Загрузка сохранённого результата синхронизации
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SYNC_STORAGE_KEY)
      if (raw) setSyncRecord(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  // Загрузка начального статуса скрейпинга
  useEffect(() => {
    api.adminScrapeIconsStatus().then(setScrapeStatus).catch(console.error)
  }, [])

  // Поллинг статуса пока идёт скрейпинг
  useEffect(() => {
    if (scrapeStatus.running) {
      pollRef.current = setInterval(() => {
        api.adminScrapeIconsStatus()
          .then(status => {
            setScrapeStatus(status)
            if (!status.running && pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }
          })
          .catch(console.error)
      }, 2000)
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [scrapeStatus.running])

  const handleScrapeIcons = async () => {
    try {
      await api.adminScrapeIcons()
      showSuccess(t('admin.scrapeIconsStarted'))
      setScrapeStatus(prev => ({ ...prev, running: true, current: 0, total: 0 }))
    } catch (err) {
      showError((err as Error).message)
    }
  }

  const handleSync = async () => {
    setSyncLoading(true)
    try {
      const res = await api.adminSyncCatalog()
      const record: SyncRecord = {
        last_run: new Date().toISOString(),
        tomes: res.tomes,
        pages: res.pages,
        challenges: res.challenges,
      }
      setSyncRecord(record)
      localStorage.setItem(SYNC_STORAGE_KEY, JSON.stringify(record))
      showSuccess(t('admin.syncSuccess'))
    } catch (err) {
      showError((err as Error).message)
    } finally {
      setSyncLoading(false)
    }
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

  const scrapeProgress = scrapeStatus.total > 0
    ? Math.round((scrapeStatus.current / scrapeStatus.total) * 100)
    : 0

  return (
    <>
      <PanelHeader>{t('admin.title')}</PanelHeader>

      <Group header={<Header>{t('admin.sync')}</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            {t('admin.syncDesc')}
          </Text>
          {syncRecord && (
            <div>
              <Caption style={{ color: 'var(--vkui--color_text_secondary)' }}>
                {t('admin.syncLastRun', { date: formatDate(syncRecord.last_run) })}
              </Caption>
              <Caption style={{ color: 'var(--vkui--color_text_tertiary)' }}>
                {t('admin.syncLastStats', { tomes: syncRecord.tomes, pages: syncRecord.pages, challenges: syncRecord.challenges })}
              </Caption>
            </div>
          )}
          <Button size="l" stretched loading={syncLoading} before={<Icon28SyncOutline />} onClick={handleSync}>
            {t('admin.syncBtn')}
          </Button>
        </Div>
      </Group>

      <Group header={<Header>{t('admin.scrapeIcons')}</Header>}>
        <Div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            {t('admin.scrapeIconsDesc')}
          </Text>
          {scrapeStatus.last_run && !scrapeStatus.running && (
            <div>
              <Caption style={{ color: 'var(--vkui--color_text_secondary)' }}>
                {t('admin.scrapeIconsLastRun', { date: formatDate(scrapeStatus.last_run) })}
              </Caption>
              <Caption style={{ color: 'var(--vkui--color_text_tertiary)' }}>
                {t('admin.scrapeIconsLastStats', { matched: scrapeStatus.last_matched, downloaded: scrapeStatus.last_downloaded })}
              </Caption>
            </div>
          )}
          {scrapeStatus.running && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Caption style={{ color: 'var(--vkui--color_text_secondary)' }}>
                {t('admin.scrapeIconsProgress', { current: scrapeStatus.current, total: scrapeStatus.total })}
              </Caption>
              <Progress value={scrapeProgress} />
            </div>
          )}
          <Button
            size="l"
            stretched
            disabled={scrapeStatus.running}
            before={<Icon28SyncOutline />}
            onClick={handleScrapeIcons}
          >
            {t('admin.scrapeIconsBtn')}
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
