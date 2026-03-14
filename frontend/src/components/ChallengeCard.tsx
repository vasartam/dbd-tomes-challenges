import React from 'react'
import { Card, Text, Caption } from '@vkontakte/vkui'
import {
  Icon24CheckCircleOutline,
  Icon24LockOutline,
  Icon240CircleOutline,
} from '@vkontakte/icons'
import type { Challenge, ChallengeStatus } from '../types'

const ROLE_LABELS: Record<string, string> = {
  survivor: 'Выживший',
  killer: 'Убийца',
  shared: 'Любой',
}

const ROLE_COLORS: Record<string, string> = {
  survivor: '#4CAF50',
  killer: '#F44336',
  shared: '#2196F3',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

interface Props {
  challenge: Challenge
  status: ChallengeStatus
  subtitle?: string
  onClick: () => void
}

export default function ChallengeCard({ challenge, status, subtitle, onClick }: Props) {
  const isLocked = status === 'locked'
  const isDone = status === 'completed'
  const roleColor = ROLE_COLORS[challenge.role] ?? '#9E9E9E'
  const roleLabel = ROLE_LABELS[challenge.role] ?? (challenge.role || '?')

  return (
    <Card
      mode="shadow"
      style={{ opacity: isLocked ? 0.5 : 1, cursor: isLocked ? 'not-allowed' : 'pointer', userSelect: 'none' }}
      onClick={onClick}
    >
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ paddingTop: 1, flexShrink: 0 }}>
            {isDone ? (
              <Icon24CheckCircleOutline fill="var(--vkui--color_icon_positive)" />
            ) : isLocked ? (
              <Icon24LockOutline fill="var(--vkui--color_icon_tertiary)" />
            ) : (
              <Icon240CircleOutline fill="var(--vkui--color_icon_secondary)" />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <Text
                weight="2"
                style={{
                  color: isLocked
                    ? 'var(--vkui--color_text_secondary)'
                    : 'var(--vkui--color_text_primary)',
                  flex: 1,
                }}
              >
                {challenge.name || challenge.challenge_key}
              </Text>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: roleColor,
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {roleLabel}
              </span>
            </div>

            {challenge.objective && (
              <Caption
                style={{
                  color: 'var(--vkui--color_text_secondary)',
                  marginTop: 4,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                } as React.CSSProperties}
              >
                {stripHtml(challenge.objective)}
              </Caption>
            )}

            {subtitle && (
              <Caption style={{ color: 'var(--vkui--color_text_tertiary)', marginTop: 4 }}>
                {subtitle}
              </Caption>
            )}

            {Array.isArray(challenge.rewards) && challenge.rewards.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                {challenge.rewards.map((r, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 11,
                      padding: '1px 7px',
                      borderRadius: 10,
                      background: 'var(--vkui--color_background_secondary)',
                      color: 'var(--vkui--color_text_secondary)',
                    }}
                  >
                    {r.id}: {r.amount}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
