'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import { SplitLayout, SplitCol, Panel, Div, Spinner, Tabbar, TabbarItem } from '@vkontakte/vkui'
import {
  Icon28ArticleOutline,
  Icon28SearchOutline,
  Icon28KeyOutline,
  Icon28GlobeOutline,
} from '@vkontakte/icons'
import { authStore, langStore } from '../stores'

interface Props { children: React.ReactNode }

export default observer(function AppShell({ children }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!authStore.loading && !authStore.isAuthenticated) router.replace('/auth')
  }, [authStore.loading, authStore.isAuthenticated, router])

  if (authStore.loading) {
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
  }

  if (!authStore.isAuthenticated) return null

  const activeStory = pathname?.startsWith('/search') ? 'search'
    : pathname?.startsWith('/admin') ? 'admin'
    : 'tomes'

  return (
    <SplitLayout center style={{ paddingBottom: 72 }}>
      <SplitCol maxWidth={1350} stretchedOnMobile>
        {children}
        <Tabbar style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: 1350 }}>
          <TabbarItem
            onClick={() => router.push('/tomes')}
            selected={activeStory === 'tomes'}
            label={langStore.t('nav.tomes')}
          >
            <Icon28ArticleOutline />
          </TabbarItem>
          <TabbarItem
            onClick={() => router.push('/search')}
            selected={activeStory === 'search'}
            label={langStore.t('nav.search')}
          >
            <Icon28SearchOutline />
          </TabbarItem>
          {authStore.isAdmin && (
            <TabbarItem
              onClick={() => router.push('/admin')}
              selected={activeStory === 'admin'}
              label={langStore.t('nav.admin')}
            >
              <Icon28KeyOutline />
            </TabbarItem>
          )}
          <TabbarItem
            onClick={() => langStore.setLang(langStore.lang === 'en' ? 'ru' : 'en')}
            label={langStore.lang.toUpperCase()}
          >
            <Icon28GlobeOutline />
          </TabbarItem>
        </Tabbar>
      </SplitCol>
    </SplitLayout>
  )
})
