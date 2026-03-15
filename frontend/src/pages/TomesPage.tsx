'use client'
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import {
  PanelHeader,
  Button,
  Group,
  Spinner,
  Div,
  Text,
  Header,
} from '@vkontakte/vkui'
import { Icon28DoorArrowLeftOutline } from '@vkontakte/icons'
import { authStore, catalogStore, langStore } from '../stores'
import type { Tome } from '../types'

function formatDate(ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
}

function TomeCard({ tome, onClick }: { tome: Tome; onClick: () => void }) {
  const t = (key: string) => langStore.t(key)
  const date = formatDate(tome.start_ts) ?? t('tomes.permanent')
  // Показываем archive_key как дополнительный идентификатор (отличает тома с одинаковым именем)
  const showKey = tome.name && tome.name !== tome.archive_key
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--vkui--color_background_secondary)',
        border: '1px solid var(--vkui--color_separator_primary)',
        borderRadius: 12,
        padding: '14px 16px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--vkui--color_background_secondary_alpha)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'var(--vkui--color_background_secondary)')}
    >
      {/* Верхняя часть: название и ключ */}
      <div style={{ flex: 1 }}>
        <div style={{
          fontWeight: 600, fontSize: 14, lineHeight: 1.3, marginBottom: 4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', overflowWrap: 'break-word',
        } as React.CSSProperties}>
          {tome.name || tome.archive_key}
        </div>
        {showKey && (
          <div style={{ fontSize: 11, color: 'var(--vkui--color_text_tertiary)', overflowWrap: 'break-word' }}>
            {tome.archive_key}
          </div>
        )}
      </div>

      {/* Дата — прибита к низу */}
      <div style={{ fontSize: 12, color: 'var(--vkui--color_text_secondary)', marginTop: 10 }}>
        {date}
      </div>
    </div>
  )
}

export default observer(function TomesPage() {
  const router = useRouter()
  const t = (key: string) => langStore.t(key)

  useEffect(() => {
    catalogStore.loadTomes()
  }, [])

  const loading = !catalogStore.tomesLoaded

  // Тома, начинающиеся с «tome» — первые, остальные — после
  const sorted = useMemo(() => {
    const tomes = [...catalogStore.tomes]
    return tomes.sort((a, b) => {
      const aIsTome = (a.name || a.archive_key).toLowerCase().startsWith('tome')
      const bIsTome = (b.name || b.archive_key).toLowerCase().startsWith('tome')
      if (aIsTome !== bIsTome) return aIsTome ? -1 : 1
      return 0
    })
  }, [catalogStore.tomes])

  return (
    <>
      <PanelHeader
        after={
          <Button
            mode="tertiary"
            before={<Icon28DoorArrowLeftOutline />}
            onClick={() => authStore.logout()}
          >
            {t('nav.logout')}
          </Button>
        }
      >
        {t('tomes.title')}
      </PanelHeader>

      {loading ? (
        <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </Div>
      ) : sorted.length === 0 ? (
        <Div>
          <Text style={{ textAlign: 'center', color: 'var(--vkui--color_text_secondary)', padding: 16 }}>
            {t('tomes.empty')}
          </Text>
        </Div>
      ) : (
        <Group>
          <Header>{t('tomes.allTomes')}</Header>
          <Div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gridAutoRows: '100px',
              gap: 10,
            }}>
              {sorted.map(tome => (
                <TomeCard
                  key={tome.archive_key}
                  tome={tome}
                  onClick={() => router.push(`/tomes/${tome.archive_key}`)}
                />
              ))}
            </div>
          </Div>
        </Group>
      )}
    </>
  )
})
