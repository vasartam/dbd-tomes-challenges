'use client'
import React from 'react'
import { Card, Text, Caption } from '@vkontakte/vkui'
import {
  Icon24CheckCircleOutline,
  Icon24LockOutline,
  Icon24CircleSmallOutline,
  Icon24Play,
  Icon24FlagFinish,
  Icon24Gift,
} from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import type { Challenge, ChallengeStatus, ChallengeNodeType } from '../types'
import { getNodeType } from '../types'
import { langStore } from '../stores'

const ROLE_COLORS: Record<string, string> = {
  survivor: '#4CAF50',
  killer: '#F44336',
  shared: '#2196F3',
}

const NODE_TYPE_COLORS: Record<ChallengeNodeType, string> = {
  prologue: '#9C27B0',
  epilogue: '#FF9800',
  reward: '#FFD700',
  challenge: '#2196F3',
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
}

interface Props {
  challenge: Challenge
  status: ChallengeStatus
  subtitle?: string
  onClick: () => void
  compact?: boolean
}

export default observer(function ChallengeCard({ challenge, status, subtitle, onClick, compact }: Props) {
  const t = (key: string) => langStore.t(key)
  const isLocked = status === 'locked'
  const isDone = status === 'completed'
  const nodeType = getNodeType(challenge.name)
  const isSpecialNode = nodeType === 'prologue' || nodeType === 'epilogue' || nodeType === 'reward'

  const nodeColor = NODE_TYPE_COLORS[nodeType]
  const roleColor = ROLE_COLORS[challenge.role] ?? '#9E9E9E'
  const roleLabel = challenge.role === 'survivor'
    ? t('challenge.survivor')
    : challenge.role === 'killer'
      ? t('challenge.killer')
      : challenge.role === 'shared'
        ? t('challenge.shared')
        : (challenge.role || '?')

  const nodeTypeLabel = nodeType === 'prologue'
    ? t('challenge.prologue')
    : nodeType === 'epilogue'
      ? t('challenge.epilogue')
      : nodeType === 'reward'
        ? t('challenge.reward')
        : ''

  const renderIcon = () => {
    if (isDone) {
      return <Icon24CheckCircleOutline fill="var(--vkui--color_icon_positive)" />
    }
    if (isLocked) {
      return <Icon24LockOutline fill="var(--vkui--color_icon_tertiary)" />
    }
    switch (nodeType) {
      case 'prologue':
        return <Icon24Play fill={nodeColor} />
      case 'epilogue':
        return <Icon24FlagFinish fill={nodeColor} />
      case 'reward':
        return <Icon24Gift fill={nodeColor} />
      default:
        return <Icon24CircleSmallOutline fill="var(--vkui--color_icon_secondary)" />
    }
  }

  if (compact || isSpecialNode) {
    return (
      <Card
        mode="shadow"
        style={{
          opacity: isLocked ? 0.5 : 1,
          cursor: isLocked ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          background: isDone ? 'var(--vkui--color_background_positive)' : undefined,
          borderColor: nodeColor,
          borderWidth: 2,
        }}
        onClick={onClick}
      >
        <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {renderIcon()}
          <Text
            weight="2"
            style={{
              color: isDone ? 'var(--vkui--color_text_contrast)' : nodeColor,
            }}
          >
            {nodeTypeLabel || challenge.name || challenge.challenge_key}
          </Text>
          {isDone && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--vkui--color_text_contrast)' }}>
              ✓
            </span>
          )}
        </div>
      </Card>
    )
  }

  return (
    <Card
      mode="shadow"
      style={{
        opacity: isLocked ? 0.5 : 1,
        cursor: isLocked ? 'not-allowed' : 'pointer',
        userSelect: 'none',
        background: isDone ? 'var(--vkui--color_background_positive)' : undefined,
      }}
      onClick={onClick}
    >
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ paddingTop: 1, flexShrink: 0 }}>
            {renderIcon()}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <Text
                weight="2"
                style={{
                  color: isDone
                    ? 'var(--vkui--color_text_contrast)'
                    : isLocked
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
                  color: isDone
                    ? 'var(--vkui--color_text_contrast_secondary)'
                    : 'var(--vkui--color_text_secondary)',
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
              <Caption style={{
                color: isDone ? 'var(--vkui--color_text_contrast_secondary)' : 'var(--vkui--color_text_tertiary)',
                marginTop: 4
              }}>
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
                      background: isDone
                        ? 'rgba(255,255,255,0.2)'
                        : 'var(--vkui--color_background_secondary)',
                      color: isDone
                        ? 'var(--vkui--color_text_contrast)'
                        : 'var(--vkui--color_text_secondary)',
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
})
