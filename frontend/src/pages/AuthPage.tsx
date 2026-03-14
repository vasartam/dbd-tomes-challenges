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

type Mode = 'login' | 'register'

export default function AuthPage() {
  const { login, register } = useAuth()
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
            Трекер заданий архивов
          </Title>
          <Text style={{ color: 'var(--vkui--color_text_secondary)' }}>
            Dead by Daylight
          </Text>
        </Div>

        <Tabs>
          <TabsItem selected={mode === 'login'} onClick={() => switchMode('login')}>
            Войти
          </TabsItem>
          <TabsItem selected={mode === 'register'} onClick={() => switchMode('register')}>
            Регистрация
          </TabsItem>
        </Tabs>

        <form onSubmit={handleSubmit}>
          <FormItem top="Никнейм">
            <Input
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="latin_letters_123"
              autoComplete="username"
            />
          </FormItem>
          <FormItem
            top="Пароль"
            status={error ? 'error' : 'default'}
            bottom={error || (mode === 'register' ? 'Минимум 6 символов' : undefined)}
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
              {mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
            </Button>
          </FormItem>
        </form>
      </Group>
    </Panel>
  )
}
