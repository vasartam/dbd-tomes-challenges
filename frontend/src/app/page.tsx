'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import { authStore } from '../stores'
import { SplitLayout, SplitCol, Panel, Div, Spinner } from '@vkontakte/vkui'

export default observer(function HomePage() {
  const router = useRouter()

  useEffect(() => {
    if (!authStore.loading) {
      if (authStore.isAuthenticated) router.replace('/tomes')
      else router.replace('/auth')
    }
  }, [authStore.loading, authStore.isAuthenticated, router])

  return (
    <SplitLayout>
      <SplitCol>
        <Panel id="loading">
          <Div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <Spinner size="l" />
          </Div>
        </Panel>
      </SplitCol>
    </SplitLayout>
  )
})
