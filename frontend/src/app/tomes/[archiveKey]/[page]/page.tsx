'use client'
import { observer } from 'mobx-react-lite'
import { useRouter, useParams } from 'next/navigation'
import AppShell from '../../../../components/AppShell'
import TomePage from '../../../../pages/TomePage'

export default observer(function TomePageRoute() {
  const router = useRouter()
  const params = useParams<{ archiveKey: string; page: string }>()
  const archiveKey = params?.archiveKey ?? ''
  const pageLevel  = params?.page ? parseInt(params.page, 10) : undefined
  return (
    <AppShell>
      <TomePage
        archiveKey={archiveKey}
        initialPageLevel={pageLevel}
        onBack={() => router.push('/tomes')}
      />
    </AppShell>
  )
})
