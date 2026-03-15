'use client'
import React, { useMemo } from 'react'
import type { Challenge, Dependency, ChallengeStatus, ChallengeInfo } from '../types'
import ChallengeCard from './ChallengeCard'

interface Props {
  challenges: Challenge[]
  dependencies: Dependency[]
  getStatus: (challenge: Challenge) => ChallengeStatus
  onChallengeClick: (challenge: Challenge) => void
}

// Конфигурация сетки
const GRID_CONFIG = {
  cellWidth: 90,    // ширина ячейки
  cellHeight: 110,  // высота ячейки
  nodeWidth: 80,    // ширина карточки
  columns: 13,      // стандартная ширина сетки DBD
}

// Проверка, есть ли у страницы позиции
export function hasGridPositions(challenges: Challenge[]): boolean {
  return challenges.some(c => c.grid_column != null && c.grid_row != null)
}

// Получить размер сетки
function getGridSize(challenges: ChallengeInfo[]): { cols: number; rows: number } {
  if (challenges.length === 0) return { cols: 1, rows: 1 }

  const cols = Math.max(
    ...challenges.map(c => c.grid_column ?? 0),
    GRID_CONFIG.columns - 1
  ) + 1

  const rows = Math.max(
    ...challenges.map(c => c.grid_row ?? 0),
    challenges.length - 1
  ) + 1

  return { cols, rows }
}

// Компонент линий связей
function ConnectionLines({
  challenges,
  dependencies,
  getStatus,
}: {
  challenges: ChallengeInfo[]
  dependencies: Dependency[]
  getStatus: (id: number) => ChallengeStatus
}) {
  const lines = useMemo(() => {
    return dependencies.map((dep, idx) => {
      const parent = challenges.find(c => c.id === dep.parent_id)
      const child = challenges.find(c => c.id === dep.child_id)

      if (!parent || !child || parent.grid_column == null || parent.grid_row == null ||
          child.grid_column == null || child.grid_row == null) {
        return null
      }

      // Центры узлов
      const x1 = (parent.grid_column + 0.5) * GRID_CONFIG.cellWidth
      const y1 = (parent.grid_row + 0.5) * GRID_CONFIG.cellHeight
      const x2 = (child.grid_column + 0.5) * GRID_CONFIG.cellWidth
      const y2 = (child.grid_row + 0.5) * GRID_CONFIG.cellHeight

      const status = getStatus(child.id)
      const color = status === 'completed'
        ? 'var(--vkui--color_icon_positive)'
        : status === 'available'
          ? 'var(--vkui--color_icon_secondary)'
          : 'var(--vkui--color_separator_primary)'

      return (
        <path
          key={idx}
          d={`M ${x1} ${y1} L ${x2} ${y2}`}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={0.6}
        />
      )
    }).filter(Boolean)
  }, [challenges, dependencies, getStatus])

  return <>{lines}</>
}

export default function ChallengeGrid({
  challenges,
  dependencies,
  getStatus,
  onChallengeClick,
}: Props) {
  const { cols, rows } = useMemo(() => getGridSize(challenges), [challenges])

  const gridWidth = cols * GRID_CONFIG.cellWidth
  const gridHeight = rows * GRID_CONFIG.cellHeight

  // Функция для получения статуса по ID
  const getStatusById = (id: number): ChallengeStatus => {
    const challenge = challenges.find(c => c.id === id)
    return challenge ? getStatus(challenge) : 'locked'
  }

  return (
    <div
      style={{
        position: 'relative',
        width: gridWidth,
        height: gridHeight,
        minWidth: '100%',
        overflow: 'visible',
      }}
    >
      {/* SVG слой для линий связей */}
      <svg
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: gridWidth,
          height: gridHeight,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      >
        <ConnectionLines
          challenges={challenges}
          dependencies={dependencies}
          getStatus={getStatusById}
        />
      </svg>

      {/* Узлы заданий */}
      {challenges.map((challenge) => {
        const col = challenge.grid_column ?? Math.floor(GRID_CONFIG.columns / 2)
        const row = challenge.grid_row ?? challenge.node_index

        const left = col * GRID_CONFIG.cellWidth + (GRID_CONFIG.cellWidth - GRID_CONFIG.nodeWidth) / 2
        const top = row * GRID_CONFIG.cellHeight

        return (
          <div
            key={challenge.challenge_key}
            style={{
              position: 'absolute',
              left,
              top,
              width: GRID_CONFIG.nodeWidth,
              zIndex: 1,
            }}
          >
            <ChallengeCard
              challenge={challenge}
              status={getStatus(challenge)}
              onClick={() => onChallengeClick(challenge)}
            />
          </div>
        )
      })}
    </div>
  )
}
