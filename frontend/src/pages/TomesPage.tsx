'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import {
  PanelHeader,
  PanelHeaderButton,
  Group,
  SimpleCell,
  Spinner,
  Div,
  Text,
  Header,
} from '@vkontakte/vkui'
import { Icon28DoorArrowLeftOutline } from '@vkontakte/icons'
import { authStore, catalogStore, langStore } from '../stores'

function formatDate(ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
}

export default observer(function TomesPage() {
  const router = useRouter()
  const t = (key: string) => langStore.t(key)

  useEffect(() => {
    catalogStore.loadTomes()
  }, [])

  const loading = !catalogStore.tomesLoaded

  return (
    <>
      <PanelHeader
        after={
          <PanelHeaderButton onClick={() => authStore.logout()} label={t('nav.logout')}>
            <Icon28DoorArrowLeftOutline />
          </PanelHeaderButton>
        }
      >
        {t('tomes.title')}
      </PanelHeader>

      {loading ? (
        <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </Div>
      ) : catalogStore.tomes.length === 0 ? (
        <Div>
          <Text style={{ textAlign: 'center', color: 'var(--vkui--color_text_secondary)', padding: 16 }}>
            {t('tomes.empty')}
          </Text>
        </Div>
      ) : (
        <Group>
          <Header>{t('tomes.allTomes')}</Header>
          {catalogStore.tomes.map(tome => (
            <SimpleCell
              key={tome.archive_key}
              onClick={() => router.push(`/tomes/${tome.archive_key}`)}
              subtitle={formatDate(tome.start_ts) ?? t('tomes.permanent')}
              chevron="auto"
            >
              {tome.name || tome.archive_key}
            </SimpleCell>
          ))}
        </Group>
      )}
    </>
  )
})
