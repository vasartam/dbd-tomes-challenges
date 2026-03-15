'use client'
import '@vkontakte/vkui/dist/vkui.css'
import { AppRoot } from '@vkontakte/vkui'
import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { catalogStore, langStore } from '../stores'

export default observer(function RootLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    catalogStore.clearLangCache()
  }, [langStore.lang])

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AppRoot disableSettingVKUIClassesInRuntime>
          {mounted ? children : null}
        </AppRoot>
      </body>
    </html>
  )
})
