'use client'
import { observer } from 'mobx-react-lite'
import AppShell from '../../components/AppShell'
import SearchPage from '../../pages/SearchPage'

export default observer(function SearchRoute() {
  return <AppShell><SearchPage /></AppShell>
})
