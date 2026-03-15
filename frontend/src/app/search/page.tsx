'use client'
import { Suspense } from 'react'
import { observer } from 'mobx-react-lite'
import AppShell from '../../components/AppShell'
import SearchPage from '../../pages/SearchPage'

export default observer(function SearchRoute() {
  return (
    <AppShell>
      <Suspense>
        <SearchPage />
      </Suspense>
    </AppShell>
  )
})
