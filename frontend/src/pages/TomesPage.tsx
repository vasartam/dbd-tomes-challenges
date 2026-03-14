import React, { useEffect, useState } from 'react'
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
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import type { Tome } from '../types'

function formatDate(ts: number | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts * 1000).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long' })
}

interface Props {
  onTomeClick: (archiveKey: string) => void
}

export default function TomesPage({ onTomeClick }: Props) {
  const { logout } = useAuth()
  const [tomes, setTomes] = useState<Tome[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getTomes()
      .then(setTomes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <PanelHeader
        after={
          <PanelHeaderButton onClick={logout} label="Выйти">
            <Icon28DoorArrowLeftOutline />
          </PanelHeaderButton>
        }
      >
        Тома архивов
      </PanelHeader>

      {loading ? (
        <Div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Spinner />
        </Div>
      ) : tomes.length === 0 ? (
        <Div>
          <Text style={{ textAlign: 'center', color: 'var(--vkui--color_text_secondary)', padding: 16 }}>
            Каталог пуст. Запустите синхронизацию через POST /api/admin/sync-catalog
          </Text>
        </Div>
      ) : (
        <Group>
          <Header>Все тома</Header>
          {tomes.map(tome => (
            <SimpleCell
              key={tome.archive_key}
              onClick={() => onTomeClick(tome.archive_key)}
              subtitle={formatDate(tome.start_ts) ?? 'Постоянный контент'}
              chevron="auto"
            >
              {tome.name || tome.archive_key}
            </SimpleCell>
          ))}
        </Group>
      )}
    </>
  )
}
