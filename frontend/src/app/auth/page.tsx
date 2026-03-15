'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import { authStore } from '../../stores'
import AuthPage from '../../pages/AuthPage'
import { SplitLayout, SplitCol } from '@vkontakte/vkui'

export default observer(function AuthRoute() {
  const router = useRouter()

  useEffect(() => {
    if (!authStore.loading && authStore.isAuthenticated) {
      router.replace('/tomes')
    }
  }, [authStore.loading, authStore.isAuthenticated, router])

  if (authStore.loading) return null

  return (
    <SplitLayout>
      <SplitCol>
        <AuthPage />
      </SplitCol>
    </SplitLayout>
  )
})
