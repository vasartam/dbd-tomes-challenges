'use client'
import { observer } from 'mobx-react-lite'
import AppShell from '../../../components/AppShell'
import AdminDepsPage from '../../../pages/AdminDepsPage'

export default observer(function AdminDepsRoute() {
  return <AppShell><AdminDepsPage /></AppShell>
})
