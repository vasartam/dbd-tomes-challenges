import React, { useState } from 'react'
import {
  Panel,
  PanelHeader,
  Group,
  FormItem,
  Input,
  Button,
  Tabs,
  TabsItem,
  Div,
  Title,
  Text,
} from '@vkontakte/vkui'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const { login, register } = useAuth()
  const { t } = useLanguage()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(username, password)
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (newMode: Mode) => {
    setMode(newMode)
    setError('')
    setUsername('')
    setPassword('')
  }

  return (
    <Panel id="auth">
      <PanelHeader>DBD Tomes</PanelHeader>
      <Group>
        <Div style={{ textAlign: 'center', paddingTop: 16, paddingBottom: 8 }}>
          <Title level="2" style={{ marginBottom: 6 }}>
            {t('auth.title')}
          </Title>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            Dead by Daylight
          </Text>
        </Div>

        <Tabs>
          <TabsItem selected={mode === 'login'} onClick={() => switchMode('login')}>
            {t('auth.login')}
          </TabsItem>
          <TabsItem selected={mode === 'register'} onClick={() => switchMode('register')}>
            {t('auth.register')}
          </TabsItem>
        </Tabs>

        <form onSubmit={handleSubmit}>
          <FormItem top={t('auth.username')}>
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="latin_letters_123"
              autoComplete="username"
            />
          </FormItem>
          <FormItem
            top={t('auth.password')}
            status={error ? 'error' : 'default'}
            bottom={error || (mode === 'register' ? t('auth.minPassword') : undefined)}
          >
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </FormItem>
          <FormItem>
            <Button
              size="l"
              stretched
              type="submit"
              loading={loading}
              disabled={!username || !password}
            >
              {mode === 'login' ? t('auth.loginBtn') : t('auth.registerBtn')}
            </Button>
          </FormItem>
        </form>
      </Group>
    </Panel>
  )
}
