'use client'
import { observer } from 'mobx-react-lite'
import { useRouter } from 'next/navigation'
import AppShell from '../../../components/AppShell'
import TomePage from '../../../pages/TomePage'

export default observer(function TomeRoute({ params }: { params: { archiveKey: string } }) {
  const router = useRouter()
  return (
    <AppShell>
      <TomePage archiveKey={params.archiveKey} onBack={() => router.push('/tomes')} />
    </AppShell>
  )
})
