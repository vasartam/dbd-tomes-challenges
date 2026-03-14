import React, { useState, useEffect } from 'react'
import {
  SplitLayout,
  SplitCol,
  Epic,
  View,
  Panel,
  Tabbar,
  TabbarItem,
  Div,
  Spinner,
} from '@vkontakte/vkui'
import {
  Icon28ArticleOutline,
  Icon28SearchOutline,
  Icon28KeyOutline,
  Icon28GlobeOutline,
} from '@vkontakte/icons'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ProgressProvider } from './contexts/ProgressContext'
import { LanguageProvider, useLanguage } from './contexts/LanguageContext'
import { setApiLanguage } from './api'
import AuthPage from './pages/AuthPage'
import TomesPage from './pages/TomesPage'
import TomePage from './pages/TomePage'
import SearchPage from './pages/SearchPage'
import AdminPage from './pages/AdminPage'

type Story = 'tomes' | 'search' | 'admin'
type TomesPanel = 'list' | 'detail'

// Переключатель языка для таббара
function LanguageTabItem() {
  const { lang, setLang } = useLanguage()

  const handleClick = () => {
    setLang(lang === 'en' ? 'ru' : 'en')
  }

  return (
    <TabbarItem
      onClick={handleClick}
      label={lang.toUpperCase()}
    >
      <Icon28GlobeOutline />
    </TabbarItem>
  )
}

function AppContent() {
  const { user, loading } = useAuth()
  const { lang, t } = useLanguage()
  const [activeStory, setActiveStory] = useState<Story>('tomes')
  const [tomesPanel, setTomesPanel] = useState<TomesPanel>('list')
  const [activeTomeKey, setActiveTomeKey] = useState<string | null>(null)

  const isAdmin = Boolean(user?.is_admin)

  // Обновляем язык API при смене языка
  useEffect(() => {
    setApiLanguage(lang)
  }, [lang])

  if (loading) {
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

  if (!user) {
    return (
      <SplitLayout>
        <SplitCol>
          <AuthPage />
        </SplitCol>
      </SplitLayout>
    )
  }

  const openTome = (archiveKey: string) => {
    setActiveTomeKey(archiveKey)
    setTomesPanel('detail')
  }

  const backToTomes = () => {
    setTomesPanel('list')
  }

  return (
    <ProgressProvider>
      <SplitLayout>
        <SplitCol>
          <Epic
            activeStory={activeStory}
            tabbar={
              <Tabbar>
                <TabbarItem
                  onClick={() => setActiveStory('tomes')}
                  selected={activeStory === 'tomes'}
                  label={t('nav.tomes')}
                >
                  <Icon28ArticleOutline />
                </TabbarItem>
                <TabbarItem
                  onClick={() => setActiveStory('search')}
                  selected={activeStory === 'search'}
                  label={t('nav.search')}
                >
                  <Icon28SearchOutline />
                </TabbarItem>
                <TabbarItem
                  onClick={() => setActiveStory('admin')}
                  selected={activeStory === 'admin'}
                  label={t('nav.admin')}
                  style={{ display: isAdmin ? undefined : 'none' }}
                >
                  <Icon28KeyOutline />
                </TabbarItem>
                <LanguageTabItem />
              </Tabbar>
            }
          >
            <View id="tomes" activePanel={tomesPanel}>
              <Panel id="list">
                <TomesPage onTomeClick={openTome} />
              </Panel>
              <Panel id="detail">
                <TomePage archiveKey={activeTomeKey} onBack={backToTomes} />
              </Panel>
            </View>
            <View id="search" activePanel="search">
              <Panel id="search">
                <SearchPage />
              </Panel>
            </View>
            <View id="admin" activePanel="admin">
              <Panel id="admin">
                <AdminPage />
              </Panel>
            </View>
          </Epic>
        </SplitCol>
      </SplitLayout>
    </ProgressProvider>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </AuthProvider>
  )
}
