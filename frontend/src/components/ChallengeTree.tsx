'use client'
import React from 'react'
import type { Challenge, ChallengeStatus } from '../types'
import ChallengeCard from './ChallengeCard'

interface Props {
  challenges: Challenge[]
  getStatus: (challenge: Challenge) => ChallengeStatus
  onChallengeClick: (challenge: Challenge) => void
}

const STATUS_COLOR: Record<ChallengeStatus, string> = {
  completed: 'var(--vkui--color_icon_positive)',
  available: 'var(--vkui--color_icon_secondary)',
  locked: 'var(--vkui--color_separator_primary)',
}

export default function ChallengeTree({ challenges, getStatus, onChallengeClick }: Props) {
  if (challenges.length === 0) return null

  return (
    <div style={{ position: 'relative', paddingLeft: 20 }}>
      {/* Vertical backbone line */}
      {challenges.length > 1 && (
        <div
          style={{
            position: 'absolute',
            left: 31,
            top: 24,
            bottom: 24,
            width: 2,
            background: 'var(--vkui--color_separator_primary)',
            zIndex: 0,
          }}
        />
      )}

      {challenges.map((challenge, idx) => {
        const status = getStatus(challenge)
        const connectorColor = STATUS_COLOR[status]
        const isLast = idx === challenges.length - 1

        return (
          <div
            key={challenge.challenge_key}
            style={{ position: 'relative', marginBottom: isLast ? 0 : 8 }}
          >
            {/* Node dot on the backbone */}
            <div
              style={{
                position: 'absolute',
                left: 11,
                top: 20,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: connectorColor,
                border: '2px solid var(--vkui--color_background_content)',
                zIndex: 1,
                boxShadow: '0 0 0 2px ' + connectorColor,
              }}
            />

            {/* Horizontal arm from backbone to card */}
            <div
              style={{
                position: 'absolute',
                left: 17,
                top: 25,
                width: 20,
                height: 2,
                background: connectorColor,
                zIndex: 1,
              }}
            />

            {/* Challenge card offset to the right of the backbone */}
            <div style={{ marginLeft: 38 }}>
              <ChallengeCard
                challenge={challenge}
                status={status}
                onClick={() => onChallengeClick(challenge)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
