'use client'
import { observer } from 'mobx-react-lite'
import AppShell from '../../components/AppShell'
import AdminPage from '../../pages/AdminPage'

export default observer(function AdminRoute() {
  return <AppShell><AdminPage /></AppShell>
})
