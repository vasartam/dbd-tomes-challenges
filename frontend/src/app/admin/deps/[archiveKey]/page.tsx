'use client'
import { observer } from 'mobx-react-lite'
import { useParams } from 'next/navigation'
import AppShell from '../../../../components/AppShell'
import AdminDepsPage from '../../../../pages/AdminDepsPage'

export default observer(function AdminDepsRoute() {
  const params = useParams<{ archiveKey: string }>()
  const archiveKey = params?.archiveKey ?? ''
  return (
    <AppShell>
      <AdminDepsPage initialArchiveKey={archiveKey} />
    </AppShell>
  )
})
