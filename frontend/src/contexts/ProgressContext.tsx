import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import { useAuth } from './AuthContext'

interface ProgressContextValue {
  progress: Record<string, boolean>
  toggleProgress: (challengeKey: string, completed: boolean) => Promise<void>
  isCompleted: (challengeKey: string) => boolean
}

const ProgressContext = createContext<ProgressContextValue | null>(null)

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [progress, setProgress] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) {
      setProgress({})
      return
    }
    api.getProgress()
      .then(items => {
        const map: Record<string, boolean> = {}
        for (const item of items) {
          map[item.challenge_key] = item.completed === true || (item.completed as unknown as number) === 1
        }
        setProgress(map)
      })
      .catch(console.error)
  }, [user])

  const toggleProgress = useCallback(async (challengeKey: string, completed: boolean) => {
    await api.setProgress(challengeKey, completed)
    setProgress(prev => ({ ...prev, [challengeKey]: completed }))
  }, [])

  const isCompleted = useCallback(
    (challengeKey: string) => !!progress[challengeKey],
    [progress]
  )

  return (
    <ProgressContext.Provider value={{ progress, toggleProgress, isCompleted }}>
      {children}
    </ProgressContext.Provider>
  )
}

export function useProgress(): ProgressContextValue {
  const ctx = useContext(ProgressContext)
  if (!ctx) throw new Error('useProgress must be used within ProgressProvider')
  return ctx
}
