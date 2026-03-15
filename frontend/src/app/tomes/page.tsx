'use client'
import { observer } from 'mobx-react-lite'
import AppShell from '../../components/AppShell'
import TomesPage from '../../pages/TomesPage'

export default observer(function TomesRoute() {
  return (
    <AppShell>
      <TomesPage />
    </AppShell>
  )
})
