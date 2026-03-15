'use client'
import { observer } from 'mobx-react-lite'
import { useRouter, useParams } from 'next/navigation'
import AppShell from '../../../components/AppShell'
import TomePage from '../../../pages/TomePage'

export default observer(function TomeRoute() {
  const router = useRouter()
  // useParams() может вернуть null вне динамического маршрута
  const params = useParams<{ archiveKey: string }>()
  const archiveKey = params?.archiveKey ?? ''
  return (
    <AppShell>
      <TomePage archiveKey={archiveKey} initialPageLevel={1} onBack={() => router.push('/tomes')} />
    </AppShell>
  )
})
